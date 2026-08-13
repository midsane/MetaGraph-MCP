import { Router } from 'express';
import { CatalogStore } from '../../storage/catalog-store.js';

const router = Router();

/**
 * @openapi
 * /api/retrieve-catalog-db:
 *   get:
 *     summary: Full state of catalog-db (tables, columns, PII verdicts, business descriptions, sync watermark)
 *     responses:
 *       200:
 *         description: Everything MetaGraph currently knows about the catalog, for demoing what syncUp() produced
 */
router.get('/', async (_req, res) => {
  try {
    const [storedSchema, syncWatermark] = await Promise.all([
      CatalogStore.getStoredSchema(),
      CatalogStore.getSyncState(),
    ]);

    const tables = Array.from(storedSchema.values());

    res.json({ tables, syncWatermark });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
