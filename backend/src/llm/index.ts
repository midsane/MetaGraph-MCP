import { config } from '../config/env.js';
import { GeminiProvider } from './gemini-provider.js';
import { OpenRouterProvider } from './openrouter-provider.js';
import type { LlmProvider, EmbeddingProvider } from './types.js';

export type ActiveProvider = LlmProvider & EmbeddingProvider;

let cached: ActiveProvider | null = null;
let cachedFor: string | null = null;

/**
 * Every text-generation and embedding call in this codebase (Scribe agent,
 * HyDE, the agent runtime, vector-store embeddings) goes through this single
 * factory, switched by the LLM_PROVIDER env var ('gemini' | 'openrouter').
 * Re-reads config.llmProvider on each call so a changed env var takes effect
 * on the next call without a stale cached instance from a different provider.
 */
export function getLlmProvider(): ActiveProvider {
  if (cached && cachedFor === config.llmProvider) return cached;

  cached = config.llmProvider === 'openrouter' ? new OpenRouterProvider() : new GeminiProvider();
  cachedFor = config.llmProvider;

  return cached;
}

export * from './types.js';
