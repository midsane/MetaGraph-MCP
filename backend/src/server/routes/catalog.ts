import { Router } from 'express';
import { CatalogStore } from '../../storage/catalog-store.js';

const router = Router();

// Lists the tables known to the metadata catalog (catalog-db). This is
// intentionally a lightweight endpoint so clients do not need semantic
// search for navigation.

/**
 * @openapi
 * /api/catalog:
 *   get:
 *     summary: fetch existing tables
 */
router.get('/', async (_req, res) => {
  try {
    const tables = await CatalogStore.getAllTables();

    const enriched = await Promise.all(tables.map(async table => {
      const columns = await CatalogStore.getTableColumns(table.id);
      return {
        tableName: table.table_name,
        business_description: table.business_summary || '',
        columnCount: columns.length,
        piiColumnCount: columns.filter(c => c.is_pii).length,
      };
    }));

    res.json({ tables: enriched });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
