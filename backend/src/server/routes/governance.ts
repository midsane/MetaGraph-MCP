import { Router } from 'express';
import { CatalogStore } from '../../storage/catalog-store.js';

const router = Router();

// Lists the columns with RBAC given a table name
router.get('/:tableName', async (req, res) => {
  try {
    const table = await CatalogStore.getTableByName(req.params.tableName);
    if (!table) {
      return res.status(404).json({ error: `Table "${req.params.tableName}" was not found in the catalog.` });
    }

    const allColumns = await CatalogStore.getTableColumns(table.id);
    const role = String(req.query.role || 'ANALYST').toUpperCase();
    const isAdmin = role === 'ADMIN';

    const columns = allColumns.map(column => {
      if (!column.is_pii || isAdmin) {
        return {
          name: column.column_name,
          description: column.pii_reason || '',
          is_pii: column.is_pii,
          redacted: false,
        };
      }

      return {
        name: '[REDACTED PII COLUMN]',
        description: 'ACCESS DENIED: PII metadata is restricted to ADMIN.',
        is_pii: true,
        redacted: true,
      };
    });

    res.json({
      tableName: table.table_name,
      business_description: table.business_summary || '',
      columns,
      piiColumnCount: allColumns.filter(column => column.is_pii).length,
      role: isAdmin ? 'ADMIN' : 'ANALYST',
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
