import { CatalogStore } from '../../storage/catalog-store.js';

export const getGovernedSchemaTool = {
  name: 'get_governed_schema',
  description: 'Returns catalog-db schema metadata (columns + business description) with automatic RBAC PII redaction.',
  inputSchema: {
    type: 'object',
    properties: {
      tableName: { type: 'string', description: 'Name of the database table' },
      userRole: { type: 'string', description: 'User role: ADMIN or ANALYST' }
    },
    required: ['tableName', 'userRole']
  },
  execute: async (args) => {
    const table = await CatalogStore.getTableByName(args.tableName);

    if (!table) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ error: `Table '${args.tableName}' not found in catalog.` }, null, 2)
        }]
      };
    }

    const columns = await CatalogStore.getTableColumns(table.id);
    const isAdmin = args.userRole === 'ADMIN';

    const column_metadata = columns.map(col => {
      if (col.is_pii && !isAdmin) {
        return {
          name: `[REDACTED_PII_${col.column_name.toUpperCase()}]`,
          description: 'ACCESS DENIED: PII Masked due to ANALYST role policies.',
          is_pii: true,
        };
      }
      return {
        name: col.column_name,
        description: col.pii_reason || '',
        is_pii: col.is_pii,
      };
    });

    const responsePayload = {
      tableName: table.table_name,
      business_description: table.business_summary,
      column_metadata,
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(responsePayload, null, 2) }]
    };
  }
};
