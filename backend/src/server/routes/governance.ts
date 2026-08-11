import { Router } from 'express';
import { store } from '../../core/metadata-store.js';

const router = Router();


// Lists the columns with RBAC given a table name
router.get('/:tableName', async (req, res) => {
  try {
    await store.loadFromDb();

    const metadata = store.getMetadata(req.params.tableName);
    if (!metadata) {
      return res.status(404).json({ error: `Table "${req.params.tableName}" was not found in the catalog.` });
    }

    const role = String(req.query.role || 'ANALYST').toUpperCase();
    const isAdmin = role === 'ADMIN';
    const columns = (metadata.column_metadata || []).map(column => {
      if (!column.is_pii || isAdmin) return { ...column, redacted: false };

      return {
        name: '[REDACTED PII COLUMN]',
        description: 'ACCESS DENIED: PII metadata is restricted to ADMIN.',
        is_pii: true,
        redacted: true,
      };
    });

    res.json({
      tableName: req.params.tableName,
      business_description: metadata.business_description || '',
      confidence_score: metadata.confidence_score,
      columns,
      piiColumnCount: (metadata.column_metadata || []).filter(column => column.is_pii).length,
      role: isAdmin ? 'ADMIN' : 'ANALYST',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
