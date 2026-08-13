import { CatalogStore } from '../../storage/catalog-store.js';
import { mapStoredColumns, redactColumns } from '../../rbac/redact.js';

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
    const column_metadata = redactColumns(mapStoredColumns(columns), args.userRole);

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
