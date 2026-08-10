import { vectorStore } from '../../core/vector-store.js';

export const vectorSearchTool = {
  name: 'search_business_glossary',
  description: 'Semantic vector search over the database catalog with automatic RBAC PII redaction. Returns matching tables, business descriptions, column lists, and lineage dependencies.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { 
        type: 'string', 
        description: 'Natural language search query e.g. "user social security numbers" or "lifetime revenue calculations"' 
      },
      userRole: { 
        type: 'string', 
        description: 'Role of the requesting user or agent: ADMIN or ANALYST (default: ANALYST)' 
      },
      topK: { 
        type: 'number', 
        description: 'Number of top matching tables to return (default: 3)' 
      }
    },
    required: ['query']
  },
  execute: async (args) => {
    const role = args.userRole || 'ANALYST';

    // 1. Run vector similarity search in Qdrant
    const matches = await vectorStore.searchSemantic(args.query, args.topK || 3);

    if (!matches || matches.length === 0) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ message: `No matching metadata found for query: "${args.query}"` }, null, 2)
        }]
      };
    }

    // 2. Format payload & apply RBAC PII redaction
    const enrichedResults = matches.map(hit => {
      let columns = hit.columns || [];

      // Enforce RBAC PII Redaction for non-admin requests
      if (role !== 'ADMIN') {
        columns = columns.map(col => {
          if (col.is_pii) {
            return {
              ...col,
              name: `[REDACTED_PII_${col.name.toUpperCase()}]`,
              description: 'ACCESS DENIED: PII Masked due to ANALYST role policies.'
            };
          }
          return col;
        });
      }

      return {
        tableName: hit.tableName,
        business_description: hit.business_description,
        match_score: hit.similarity_score,
        columns,
        upstream_dependencies: hit.upstream_dependencies || [],
        downstream_dependents: hit.downstream_dependents || []
      };
    });

    return { 
      content: [{ type: 'text', text: JSON.stringify(enrichedResults, null, 2) }] 
    };
  }
};