import { vectorStore } from '../../storage/vector-store.js';
import { CatalogStore } from '../../storage/catalog-store.js';
import { LineageStore } from '../../storage/lineage-store.js';
import { mapStoredColumns, redactColumns } from '../../rbac/redact.js';

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
  /** Runs a semantic search over the catalog, hydrates each hit with columns/lineage, and redacts PII per role. */
  execute: async (args) => {
    const role = args.userRole || 'ANALYST';

    // __embedText is an internal-only override (never declared in inputSchema,
    // so an LLM tool-caller has no way to set it) used by the agent runtime's
    // HyDE query expansion: it embeds a richer hypothetical document instead
    // of the terse raw query, while the returned `query` stays user-facing.
    const searchText = typeof args.__embedText === 'string' && args.__embedText.trim()
      ? args.__embedText
      : args.query;

    // 1. Run vector similarity search in Qdrant (pointer: tableName + tableId + description)
    const matches = await vectorStore.searchSemantic(searchText, args.topK || 3);

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

      const columns = redactColumns(mapStoredColumns(rawColumns), role);

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
