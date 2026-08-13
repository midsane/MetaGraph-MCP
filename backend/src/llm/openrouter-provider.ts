import { config } from '../config/env.js';
import { EMBEDDING_DIMENSIONS } from './constants.js';
import type {
  LlmProvider,
  EmbeddingProvider,
  LlmChatOptions,
  LlmChatResult,
  LlmJsonOptions,
  LlmMessage,
  LlmToolCall,
} from './types.js';

const BASE_URL = 'https://openrouter.ai/api/v1';

/**
 * OpenRouter's chat/completions and embeddings endpoints are OpenAI-format
 * compatible, so tool `parameters` (plain JSON Schema) pass through
 * untouched - no conversion needed, unlike the Gemini adapter.
 */
function toOpenAiMessages(system: string, messages: LlmMessage[]): any[] {
  const out: any[] = [{ role: 'system', content: system }];

  for (const msg of messages) {
    if (msg.role === 'user') {
      out.push({ role: 'user', content: msg.content || '' });
    } else if (msg.role === 'assistant') {
      const entry: any = { role: 'assistant', content: msg.content ?? null };
      if (msg.toolCalls?.length) {
        entry.tool_calls = msg.toolCalls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.args) },
        }));
      }
      out.push(entry);
    } else if (msg.role === 'tool') {
      out.push({ role: 'tool', tool_call_id: msg.toolCallId, content: msg.content ?? '' });
    }
  }

  return out;
}

function mapFinishReason(reason: string | undefined): LlmChatResult['finishReason'] {
  switch (reason) {
    case 'stop': return 'stop';
    case 'tool_calls': return 'tool_calls';
    case 'length': return 'max_tokens';
    case 'content_filter': return 'safety';
    default: return 'other';
  }
}

function safeJsonParse(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export class OpenRouterProvider implements LlmProvider, EmbeddingProvider {
  readonly name = 'openrouter';
  readonly embeddingDimensions = EMBEDDING_DIMENSIONS;

  private async request(path: string, body: Record<string, unknown>): Promise<any> {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.openrouter.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => response.statusText);
      throw new Error(`OpenRouter ${path} failed (${response.status}): ${errText}`);
    }

    return response.json();
  }

  async chat(options: LlmChatOptions): Promise<LlmChatResult> {
    const body: Record<string, unknown> = {
      model: config.openrouter.model,
      messages: toOpenAiMessages(options.system, options.messages),
      ...(options.tools?.length
        ? {
            tools: options.tools.map(t => ({
              type: 'function',
              function: { name: t.name, description: t.description, parameters: t.parameters },
            })),
            tool_choice: 'auto',
          }
        : {}),
      ...(options.maxOutputTokens ? { max_tokens: options.maxOutputTokens } : {}),
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
    };

    const data = await this.request('/chat/completions', body);
    const choice = data.choices?.[0];
    const message = choice?.message || {};

    const toolCalls: LlmToolCall[] = (message.tool_calls || []).map((tc: any) => ({
      id: tc.id,
      name: tc.function?.name || '',
      args: safeJsonParse(tc.function?.arguments),
    }));

    return {
      text: message.content ?? null,
      toolCalls,
      finishReason: toolCalls.length > 0 ? 'tool_calls' : mapFinishReason(choice?.finish_reason),
    };
  }

  async generateJson(options: LlmJsonOptions): Promise<string | null> {
    try {
      // Strict json_schema response_format support varies across the many
      // models OpenRouter proxies to, so the schema is spelled out in the
      // prompt as a robust common denominator, and json_object mode just
      // guarantees syntactically valid JSON back.
      const schemaHint = options.schema
        ? `\n\nRespond with ONLY a single JSON object matching this JSON Schema, no markdown fences, no commentary:\n${JSON.stringify(options.schema)}`
        : '';

      const data = await this.request('/chat/completions', {
        model: config.openrouter.model,
        messages: [
          { role: 'system', content: (options.system || 'You output strict JSON only.') + schemaHint },
          { role: 'user', content: options.prompt },
        ],
        response_format: { type: 'json_object' },
        ...(options.maxOutputTokens ? { max_tokens: options.maxOutputTokens } : {}),
      });

      return data.choices?.[0]?.message?.content ?? null;
    } catch (err) {
      console.error('[OpenRouterProvider] generateJson failed:', err instanceof Error ? err.message : err);
      return null;
    }
  }

  async embed(text: string): Promise<number[] | null> {
    try {
      const data = await this.request('/embeddings', {
        model: config.openrouter.embeddingModel,
        input: text,
        dimensions: EMBEDDING_DIMENSIONS,
      });

      const vector = data.data?.[0]?.embedding;
      if (!Array.isArray(vector) || vector.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(
          `Unexpected embedding response: expected ${EMBEDDING_DIMENSIONS} values, received ${vector?.length ?? 0}. ` +
          `The configured OPENROUTER_EMBEDDING_MODEL may not honor the "dimensions" truncation parameter.`
        );
      }
      return vector;
    } catch (err) {
      console.error('[OpenRouterProvider] embed failed:', err instanceof Error ? err.message : err);
      return null;
    }
  }
}
