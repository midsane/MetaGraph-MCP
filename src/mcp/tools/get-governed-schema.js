import { store } from '../../core/metadata-store.js';

export const getGovernedSchemaTool = {
  name: 'get_governed_schema',
  description: 'Returns pre-indexed schema metadata with automatic RBAC PII redaction (Zero LLM latency).',
  inputSchema: {
    type: 'object',
    properties: {
      tableName: { type: 'string', description: 'Name of the database table' },
      userRole: { type: 'string', description: 'User role: ADMIN or ANALYST' }
    },
    required: ['tableName', 'userRole']
  },
  execute: async (args) => {
    // 1. Ensure DB hydration on cold start
    await store.loadFromDb();

    // 2. Fetch pre-cached, fully documented metadata from MetadataStore
    const metadata = store.getMetadata(args.tableName);

    if (!metadata) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ error: `Table '${args.tableName}' not found in metadata catalog.` }, null, 2)
        }]
      };
    }

    // 3. Deep-clone payload so we don't mutate the in-memory store
    const responsePayload = JSON.parse(JSON.stringify(metadata));

    // 4. Enforce RBAC PII Redaction instantly (Zero LLM overhead)
    if (args.userRole !== 'ADMIN') {
      responsePayload.column_metadata = responsePayload.column_metadata.map(col => {
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
      content: [{ type: 'text', text: JSON.stringify(responsePayload, null, 2) }] 
    };
  }
};