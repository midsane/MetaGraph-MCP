import { Router } from 'express';
import { CatalogStore } from '../../storage/catalog-store.js';
import { LineageStore } from '../../storage/lineage-store.js';
import { vectorStore } from '../../storage/vector-store.js';

const router = Router();

/**
 * @openapi
 * /api/purge:
 *   post:
 *     summary: Purge all catalog, lineage and vector data (catalog-db, Neo4j, Qdrant)
 *     responses:
 *       200:
 *         description: Catalog, lineage graph and vector index purged successfully.
 */
router.post('/', async (req, res) => {
  try {
    await Promise.all([
      CatalogStore.purge(),
      LineageStore.purge(),
      vectorStore.purge(),
    ]);
    res.status(200).json({ message: 'Catalog, lineage graph and vector index purged successfully.' });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
