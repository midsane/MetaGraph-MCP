import { CatalogStore } from '../../storage/catalog-store.js';

const MAX_TABLES_RETURNED = 50;

export const listCatalogTablesTool = {
  name: 'list_catalog_tables',
  description:
    'Lists every active table currently tracked in the catalog with its business description, ' +
    'for discovery when the exact table name is unknown. Does not return column-level or PII detail.',
  inputSchema: {
    type: 'object',
    properties: {},
    required: []
  },
  /** Lists every active catalog table with its business description, capped at MAX_TABLES_RETURNED. */
  execute: async () => {
    const tables = await CatalogStore.getAllTables();
    const truncated = tables.length > MAX_TABLES_RETURNED;

    const payload = {
      total_tables: tables.length,
      tables: tables.slice(0, MAX_TABLES_RETURNED).map((t: any) => ({
        tableName: t.table_name,
        business_description: t.business_summary || '',
      })),
      ...(truncated
        ? { note: `+${tables.length - MAX_TABLES_RETURNED} more tables not shown, narrow your search` }
        : {}),
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }]
    };
  }
};
