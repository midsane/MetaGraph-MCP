import { GoogleGenAI, Type, FunctionCallingConfigMode, type Content } from '@google/genai';
import { config } from '../config/env.js';
import { EMBEDDING_DIMENSIONS } from './constants.js';
import { classifyLlmError, logLlmError } from './errors.js';
import type {
  LlmProvider,
  EmbeddingProvider,
  LlmChatOptions,
  LlmChatResult,
  LlmJsonOptions,
  LlmJsonSchema,
  LlmMessage,
  LlmToolCall,
} from './types.js';

/** Maps a plain JSON Schema type string to the Gemini SDK's Type enum. */
function toGeminiType(t: string | undefined): Type {
  switch (t) {
    case 'string': return Type.STRING;
    case 'number': return Type.NUMBER;
    case 'integer': return Type.INTEGER;
    case 'boolean': return Type.BOOLEAN;
    case 'array': return Type.ARRAY;
    case 'object': return Type.OBJECT;
    default: return Type.STRING;
  }
}

/** Recursively converts a plain JSON Schema into the shape the Gemini SDK expects. */
function toGeminiSchema(schema: LlmJsonSchema): any {
  if (!schema || typeof schema !== 'object') return schema;
  const out: any = {};
  if (schema.type) out.type = toGeminiType(schema.type);
  if (schema.description) out.description = schema.description;
  if (schema.properties) {
    out.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([k, v]) => [k, toGeminiSchema(v)])
    );
  }
  if (schema.items) out.items = toGeminiSchema(schema.items);
  if (schema.required) out.required = schema.required;
  return out;
}

/**
 * Converts the provider-agnostic message list into Gemini's Content[] shape.
 * Consecutive 'tool' messages (all results from one assistant turn's tool
 * calls) are merged into a single role:'user' Content with multiple
 * functionResponse parts, matching order - Gemini expects exactly one such
 * batch per assistant tool-calling turn, not one Content per tool result.
 */
function toGeminiContents(messages: LlmMessage[]): Content[] {
  const contents: Content[] = [];
  let toolBatch: any[] | null = null;

  for (const msg of messages) {
    if (msg.role === 'tool') {
      let parsedResponse: Record<string, unknown> = {};
      try {
        parsedResponse = msg.content ? JSON.parse(msg.content) : {};
      } catch {
        parsedResponse = { raw: msg.content };
      }
      const part = { functionResponse: { name: msg.name, response: parsedResponse } };
      if (toolBatch) {
        toolBatch.push(part);
      } else {
        toolBatch = [part];
        contents.push({ role: 'user', parts: toolBatch });
      }
      continue;
    }

    toolBatch = null;

    if (msg.role === 'user') {
      contents.push({ role: 'user', parts: [{ text: msg.content || '' }] });
    } else if (msg.role === 'assistant') {
      const parts: any[] = [];
      if (msg.content) parts.push({ text: msg.content });
      for (const tc of msg.toolCalls || []) {
        const part: any = { functionCall: { name: tc.name, args: tc.args } };
        // Newer Gemini models require their own prior thoughtSignature to be
        // replayed verbatim on the functionCall part when it's fed back as
        // history, or the next turn 400s ("missing a thought_signature").
        const sig = (tc.providerData as { thoughtSignature?: string } | undefined)?.thoughtSignature;
        if (sig) part.thoughtSignature = sig;
        parts.push(part);
      }
      contents.push({ role: 'model', parts });
    }
  }

  return contents;
}

/** Maps Gemini's finishReason strings to the provider-agnostic LlmFinishReason. */
function mapFinishReason(reason: string | undefined): LlmChatResult['finishReason'] {
  switch (reason) {
    case 'STOP': return 'stop';
    case 'MAX_TOKENS': return 'max_tokens';
    case 'SAFETY':
    case 'RECITATION':
    case 'BLOCKLIST':
    case 'PROHIBITED_CONTENT':
    case 'SPII':
      return 'safety';
    default:
      return 'other';
  }
}

export class GeminiProvider implements LlmProvider, EmbeddingProvider {
  readonly name = 'gemini';
  readonly embeddingDimensions = EMBEDDING_DIMENSIONS;
  private ai: GoogleGenAI;

  /**
   * Creates the underlying Gemini SDK client using the configured API key.
   * Fails fast with a clear message if the key is missing, rather than
   * lazily surfacing an opaque 401 deep inside the first real call.
   * httpOptions.timeout bounds every request the client makes - without it,
   * a stalled connection just hangs instead of failing diagnosably.
   */
  constructor() {
    if (!config.geminiApiKey) {
      throw new Error(
        'GEMINI_API_KEY is not set. Set it in the environment, or set LLM_PROVIDER=openrouter to use OpenRouter instead.'
      );
    }
    this.ai = new GoogleGenAI({ apiKey: config.geminiApiKey, httpOptions: { timeout: config.llmTimeoutMs } });
  }

  /**
   * Sends a chat turn (with optional tool declarations) to Gemini and
   * normalizes the response into LlmChatResult. Never swallows failures -
   * any SDK/network error is classified (auth/rate_limit/network/timeout/
   * etc, see src/llm/errors.ts) and rethrown, so the agent runtime that
   * calls this can log and surface *why* the call failed instead of a bare
   * "fetch failed".
   */
  async chat(options: LlmChatOptions): Promise<LlmChatResult> {
    const contents = toGeminiContents(options.messages);
    const hasTools = !!options.tools?.length;

    let response;
    try {
      response = await this.ai.models.generateContent({
        model: config.geminiModel,
        contents,
        config: {
          systemInstruction: options.system,
          ...(hasTools
            ? {
                tools: [
                  {
                    functionDeclarations: options.tools!.map(t => ({
                      name: t.name,
                      description: t.description,
                      parameters: toGeminiSchema(t.parameters),
                    })),
                  },
                ],
                toolConfig: { functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO } },
              }
            : {}),
          ...(options.maxOutputTokens ? { maxOutputTokens: options.maxOutputTokens } : {}),
          ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
        },
      });
    } catch (err) {
      throw classifyLlmError(err, this.name, `chat(model=${config.geminiModel})`);
    }

    const candidate = response.candidates?.[0];
    // Walk the raw parts (not the flattened response.functionCalls getter)
    // so each tool call's sibling thoughtSignature field can be captured and
    // carried along for replay on the next turn.
    const parts = candidate?.content?.parts || [];
    const toolCalls: LlmToolCall[] = parts
      .filter((p): p is typeof p & { functionCall: NonNullable<typeof p.functionCall> } => !!p.functionCall)
      .map((p, i) => ({
        id: p.functionCall.id || `call_${i}`,
        name: p.functionCall.name || '',
        args: (p.functionCall.args as Record<string, unknown>) || {},
        providerData: p.thoughtSignature ? { thoughtSignature: p.thoughtSignature } : undefined,
      }));

    return {
      text: response.text ?? null,
      toolCalls,
      finishReason: toolCalls.length > 0 ? 'tool_calls' : mapFinishReason(candidate?.finishReason),
    };
  }

  /** Asks Gemini to generate a single JSON document matching an optional schema; returns null on failure (best-effort, logged in full so failures aren't silent). */
  async generateJson(options: LlmJsonOptions): Promise<string | null> {
    try {
      const response = await this.ai.models.generateContent({
        model: config.geminiModel,
        contents: options.prompt,
        config: {
          ...(options.system ? { systemInstruction: options.system } : {}),
          responseMimeType: 'application/json',
          ...(options.schema ? { responseSchema: toGeminiSchema(options.schema) } : {}),
          ...(options.maxOutputTokens ? { maxOutputTokens: options.maxOutputTokens } : {}),
        },
      });
      return response.text ?? null;
    } catch (err) {
      logLlmError(classifyLlmError(err, this.name, `generateJson(model=${config.geminiModel})`));
      return null;
    }
  }

  /** Embeds a text string via Gemini into a fixed-size vector; returns null on failure or dimension mismatch (best-effort, logged in full so failures aren't silent). */
  async embed(text: string): Promise<number[] | null> {
    try {
      const response = await this.ai.models.embedContent({
        model: config.geminiEmbeddingModel,
        contents: text,
        config: { outputDimensionality: EMBEDDING_DIMENSIONS },
      });

      const vector = response.embeddings?.[0]?.values;
      if (!Array.isArray(vector) || vector.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(
          `Unexpected embedding response: expected ${EMBEDDING_DIMENSIONS} values, received ${vector?.length ?? 0}.`
        );
      }
      return vector;
    } catch (err) {
      logLlmError(classifyLlmError(err, this.name, `embed(model=${config.geminiEmbeddingModel})`));
      return null;
    }
  }
}
