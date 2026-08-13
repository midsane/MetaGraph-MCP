import { Router } from 'express';
import { SyncEngine } from '../../core/sync-engine.js';

const router = Router();

/**
 * @openapi
 * /api/sync:
 *   post:
 *     summary: Manually trigger syncUp() - Track A of the dual-track ingestion engine (business-db -> catalog-db/Qdrant/Neo4j)
 *     responses:
 *       200:
 *         description: Sync result summary (new/changed/unchanged/dropped tables, query logs processed, lineage edges added)
 */
router.post('/', async (req, res) => {
  try {
    const result = await SyncEngine.syncUp();
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
