import { Router } from 'express';
import { store } from '../../core/metadata-store.js';

const router = Router();

router.post('/', async (req, res) => {
  try {
    await store.purge();
    res.json({ message: 'Database and lineage graphs purged successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;