import { Router } from 'express';
import { store } from '../../core/metadata-store.js';

const router = Router();

/**
 * @openapi
 * /api/lineage:
 *   get:
 *     summary: Retrieve current SQL Lineage Graph DAG
 *     responses:
 *       200:
 *         description: Successful graph payload
 */
router.get('/', (req, res) => {
  try {
    const graph = store.dag.exportGraph();
    res.json(graph);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;