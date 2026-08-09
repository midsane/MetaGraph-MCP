import { Router } from 'express';
import { vectorStore } from '../../core/vector-store.js';

const router = Router();

/**
 * @openapi
 * /api/search:
 *   post:
 *     summary: Semantic Vector Search over metadata embeddings (RAG)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               query:
 *                 type: string
 *     responses:
 *       200:
 *         description: Top matching metadata context entries
 */
router.post('/', async (req, res) => {
  try {
    const { query, topK } = req.body;
    if (!query) {
      return res.status(400).json({ error: 'Query string is required' });
    }

    const results = await vectorStore.searchSemantic(query, topK || 3);
    res.json({ query, matches: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;