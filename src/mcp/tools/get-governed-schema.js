import { store } from '../../core/metadata-store.js';
import { ScribeAgent } from '../../agents/scribe-agent.js';

export const getGovernedSchemaTool = {
  name: 'get_governed_schema',
  description: 'Returns schema metadata with automatic RBAC PII redaction.',
  inputSchema: {
    type: 'object',
    properties: {
      tableName: { type: 'string' },
      userRole: { type: 'string', description: 'ADMIN or ANALYST' }
    },
    required: ['tableName', 'userRole']
  },
  execute: async (args) => {
    const columns = store.getSchema(args.tableName);
    const doc = await ScribeAgent.documentTable(args.tableName, columns);

    // Enforce PII masking policy
    if (args.userRole !== 'ADMIN') {
      doc.column_metadata = doc.column_metadata.map(col => {
        if (col.is_pii) {
          return {
            ...col,
            name: `[REDACTED_PII_${col.name.toUpperCase()}]`,
            description: 'ACCESS DENIED: PII Masked'
          };
        }
        return col;
      });
    }

    return { content: [{ type: 'text', text: JSON.stringify(doc, null, 2) }] };
  }
};