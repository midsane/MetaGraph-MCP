import { Router } from 'express';
import { businessConnector } from '../../connectors/postgres-connector.js';

const router = Router();

/**
 * @openapi
 * /api/retrieve-business-db:
 *   get:
 *     summary: Raw live schema of business-db (information_schema ground truth, no catalog metadata)
 *     responses:
 *       200:
 *         description: List of tables with their columns/data types as they exist right now on business-db
 */
router.get('/', async (_req, res) => {
  try {
    const tables = await businessConnector.getLiveSchema();
    res.json({ tables });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
