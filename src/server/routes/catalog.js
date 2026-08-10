import { Router } from 'express';
import { store } from '../../core/metadata-store.js';

const router = Router();

// Lists the tables known to the metadata catalog. This is intentionally a
// lightweight endpoint so clients do not need semantic search for navigation.
router.get('/', async (_req, res) => {
  try {
    await store.loadFromDb();

    const tables = Array.from(store.tableMetadata.entries())
      .map(([tableName, metadata]) => ({
        tableName,
        business_description: metadata.business_description || '',
        columnCount: metadata.column_metadata?.length || store.getSchema(tableName).length,
        piiColumnCount: metadata.column_metadata?.filter(column => column.is_pii).length || 0,
      }))
      .sort((left, right) => left.tableName.localeCompare(right.tableName));

    res.json({ tables });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
