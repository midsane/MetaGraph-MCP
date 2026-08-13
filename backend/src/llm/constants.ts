// Both providers must agree on this so already-indexed Qdrant vectors and
// newly-indexed ones stay compatible with each other and with the fixed
// collection size in vector-store.ts. GeminiProvider.embed requests exactly
// this via outputDimensionality; OpenRouterProvider.embed requests it via
// the OpenAI-compatible `dimensions` param (honored by models that support
// embedding truncation, e.g. openai/text-embedding-3-small). Both validate
// the response length against this constant and fail loudly on a mismatch
// rather than silently corrupting the collection.
export const EMBEDDING_DIMENSIONS = 768;
