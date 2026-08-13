import { Router } from 'express';
import { businessConnector } from '../../connectors/postgres-connector.js';
import { stripSqlComments } from '../../core/sql-utils.js';

const router = Router();

/**
 * @openapi
 * /api/exec:
 *   post:
 *     summary: Applies raw SQL to the live business database (business-db)
 *     description: >
 *       Demo/test endpoint for the event-driven sync pipeline. Each statement
 *       is executed against business-db AND recorded in query_logs, so both
 *       Track A (schema sync) and Track B (lineage extraction) fire - if the
 *       event listener (`npm run sync:watch`) is running, catalog-db/Neo4j/
 *       Qdrant update automatically in response, with no manual sync call
 *       and no separate query_logs INSERT needed.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               sqlContent:
 *                 type: string
 */
router.post('/', async (req, res) => {
  try {
    const { sqlContent } = req.body;
    if (!sqlContent) return res.status(400).json({ error: 'SQL content is required' });

    const cleanSql = stripSqlComments(sqlContent);
    const { statementsApplied } = await businessConnector.applyAndLog(cleanSql);

    res.status(200).json({
      message: `${statementsApplied} statement(s) applied to business-db and logged to query_logs. If the event listener (npm run sync:watch) is running, catalog-db/Neo4j/Qdrant will update automatically.`,
      statementsApplied,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
