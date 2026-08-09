import { Router } from 'express';
import { ScribeAgent } from '../../agents/scribe-agent.js';
import { store } from '../../core/metadata-store.js';

const router = Router();

/**
 * @openapi
 * /api/document:
 *   post:
 *     summary: Trigger Scribe Agent auto-documentation and vector indexing
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               tableName:
 *                 type: string
 *               columns:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Generated business metadata
 */
router.post('/', async (req, res) => {
  try {
    const { tableName, columns } = req.body;
    if (!tableName) {
      return res.status(400).json({ error: 'tableName parameter is required' });
    }

    const colList = columns || [];
    const doc = await ScribeAgent.documentTable(tableName, colList);

    // Save generated metadata and generate Gemini embeddings in Qdrant
    await store.saveTableMetadata(tableName, colList, doc);

    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;