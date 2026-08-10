import { Router } from 'express';
import { store } from '../../core/metadata-store.js';

const router = Router();

/**
 * @openapi
 * /api/purge:
 *   post:
 *     summary: Purge existing data in vector db
 *     responses:
 *       200:
 *         description: Database and lineage graphs purged successfully.
 */
router.post('/', async (req, res) => {
  try {
    await store.purge();
    res.status(200).json({ message: 'Database and lineage graphs purged successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;