import { CatalogStore } from '../../storage/catalog-store.js';
import { mapStoredColumns, redactColumns } from '../../rbac/redact.js';
import { config } from '../../config/env.js';

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
  /** Fetches a table's catalog metadata and columns, redacting PII columns unless the caller is ADMIN. */
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
      // The live business database schema this table lives in - any SQL that
      // will actually run against business-db must qualify the table name as
      // "<schema>.<tableName>", since the connection's default search_path
      // may not include it (unqualified DDL/DML can silently target the
      // wrong schema or fail to resolve the table at all).
      schema: config.businessDb.schema,
      business_description: table.business_summary,
      column_metadata,
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(responsePayload, null, 2) }]
    };
  }
};
