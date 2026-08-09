import { vectorStore } from '../../core/vector-store.js';

export const searchMetadataTool = {
  name: 'search_business_glossary',
  description: 'Semantic vector search over database catalog, business descriptions, and metrics using RAG embeddings.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Natural language search query e.g. customer payment details' },
      topK: { type: 'number', description: 'Number of relevant context items to return' }
    },
    required: ['query']
  },
  execute: async (args) => {
    const results = await vectorStore.searchSemantic(args.query, args.topK || 3);
    return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
  }
};