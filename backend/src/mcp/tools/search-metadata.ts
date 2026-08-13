import { vectorStore } from '../../storage/vector-store.js';
import { CatalogStore } from '../../storage/catalog-store.js';
import { LineageStore } from '../../storage/lineage-store.js';

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

    // 1. Run vector similarity search in Qdrant (pointer: tableName + tableId + description)
    const matches = await vectorStore.searchSemantic(args.query, args.topK || 3);

    if (!matches || matches.length === 0) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ message: `No matching metadata found for query: "${args.query}"` }, null, 2)
        }]
      };
    }

    // 2. Hydrate each pointer with columns (Postgres) + lineage (Neo4j), and apply RBAC PII redaction
    const enrichedResults = await Promise.all(matches.map(async hit => {
      const [rawColumns, upstream, downstream] = await Promise.all([
        hit.tableId ? CatalogStore.getTableColumns(hit.tableId) : Promise.resolve([]),
        LineageStore.getUpstream(hit.tableName),
        LineageStore.getDownstream(hit.tableName),
      ]);

      let columns = rawColumns.map(col => ({
        name: col.column_name,
        description: col.pii_reason || '',
        is_pii: col.is_pii,
      }));

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
        upstream_dependencies: upstream,
        downstream_dependents: downstream
      };
    }));

    return {
      content: [{ type: 'text', text: JSON.stringify(enrichedResults, null, 2) }]
    };
  }
};
