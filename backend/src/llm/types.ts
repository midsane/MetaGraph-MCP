export type LlmRole = 'user' | 'assistant' | 'tool';

export interface LlmToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  /**
   * Opaque provider-specific data a provider may need echoed back verbatim
   * on a later turn (e.g. Gemini's thoughtSignature on function-call parts).
   * Other providers/adapters neither populate nor read this.
   */
  providerData?: unknown;
}

export interface LlmMessage {
  role: LlmRole;
  /** Present on 'user' messages, and optionally on 'assistant' messages alongside toolCalls. */
  content?: string | null;
  /** Present only on 'assistant' messages that invoke one or more tools. */
  toolCalls?: LlmToolCall[];
  /** Present only on 'tool' messages: the id of the call this message answers. */
  toolCallId?: string;
  /** Present only on 'tool' messages: the tool name that was called. */
  name?: string;
}

// Plain JSON Schema (lowercase types: 'object'|'string'|'number'|'integer'|'boolean'|'array'),
// the same shape already used by every MCP tool's inputSchema in this repo. This is what
// OpenAI/OpenRouter's function-calling API expects natively; provider adapters translate it
// into whatever their own SDK needs (e.g. GeminiProvider maps it to the Gemini Type enum).
export interface LlmJsonSchema {
  type?: string;
  description?: string;
  properties?: Record<string, LlmJsonSchema>;
  items?: LlmJsonSchema;
  required?: string[];
  [key: string]: unknown;
}

export interface LlmToolDeclaration {
  name: string;
  description: string;
  parameters: LlmJsonSchema;
}

export interface LlmChatOptions {
  system: string;
  messages: LlmMessage[];
  tools?: LlmToolDeclaration[];
  maxOutputTokens?: number;
  temperature?: number;
}

export type LlmFinishReason = 'stop' | 'tool_calls' | 'max_tokens' | 'safety' | 'other';

export interface LlmChatResult {
  text: string | null;
  toolCalls: LlmToolCall[];
  finishReason: LlmFinishReason;
}

export interface LlmJsonOptions {
  system?: string;
  prompt: string;
  schema?: LlmJsonSchema;
  maxOutputTokens?: number;
}

export interface LlmProvider {
  readonly name: string;
  chat(options: LlmChatOptions): Promise<LlmChatResult>;
  /** Returns raw text expected to be a JSON document; callers parse/validate it themselves. */
  generateJson(options: LlmJsonOptions): Promise<string | null>;
}

export interface EmbeddingProvider {
  readonly embeddingDimensions: number;
  embed(text: string): Promise<number[] | null>;
}
