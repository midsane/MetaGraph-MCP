import { store } from '../../core/metadata-store.js';

export const getGovernedSchemaTool = {
  name: 'get_governed_schema',
  description: 'Returns pre-indexed schema metadata with automatic RBAC PII redaction.',
  inputSchema: {
    type: 'object',
    properties: {
      tableName: { type: 'string', description: 'Name of the database table' },
      userRole: { type: 'string', description: 'User role: ADMIN or ANALYST' }
    },
    required: ['tableName', 'userRole']
  },
  execute: async (args) => {
    // Zero-async, instant O(1) memory lookup from hydrated Map
    const metadata = store.getMetadata(args.tableName);

    if (!metadata) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ error: `Table '${args.tableName}' not found in catalog.` }, null, 2)
        }]
      };
    }

    // Deep clone to prevent mutating internal cache state
    const responsePayload = JSON.parse(JSON.stringify(metadata));

    // Enforce PII Redaction
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