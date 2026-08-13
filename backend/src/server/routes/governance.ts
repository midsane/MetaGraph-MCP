import { Router } from 'express';
import { CatalogStore } from '../../storage/catalog-store.js';
import { isAdmin, mapStoredColumns, redactColumns } from '../../rbac/redact.js';

const router = Router();

/**
 * @openapi
 * /api/governance/{tableName}:
 *   get:
 *     summary: RBAC-redacted column listing for a single table (?role=ADMIN|ANALYST, default ANALYST)
 *     parameters:
 *       - in: path
 *         name: tableName
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           example: ANALYST
 */
router.get('/:tableName', async (req, res) => {
  try {
    const table = await CatalogStore.getTableByName(req.params.tableName);
    if (!table) {
      return res.status(404).json({ error: `Table "${req.params.tableName}" was not found in the catalog.` });
    }

    const allColumns = await CatalogStore.getTableColumns(table.id);
    const admin = isAdmin(req.query.role);

    const columns = redactColumns(mapStoredColumns(allColumns), req.query.role).map(col => ({
      ...col,
      redacted: col.is_pii && !admin,
    }));

    res.json({
      tableName: table.table_name,
      business_description: table.business_summary || '',
      columns,
      piiColumnCount: allColumns.filter(column => column.is_pii).length,
      role: admin ? 'ADMIN' : 'ANALYST',
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
