import { Router } from 'express';
import { LineageStore } from '../../storage/lineage-store.js';

const router = Router();

/**
 * @openapi
 * /api/lineage:
 *   get:
 *     summary: Retrieve current SQL Lineage Graph DAG from Neo4j
 *     responses:
 *       200:
 *         description: Successful graph payload
 */
router.get('/', async (req, res) => {
  try {
    const graph = await LineageStore.getFullGraph();
    res.json(graph);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
