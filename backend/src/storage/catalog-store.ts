import { pg } from '../config/postgres.js';

export class CatalogStore {
  // ---------------------------------------------------------
  // 1. Watermark State (Incremental Sync)
  // ---------------------------------------------------------
  static async getSyncState(): Promise<number> {
    const res = await pg.query('SELECT last_processed_query_id FROM catalog.sync_state ORDER BY id DESC LIMIT 1');
    return res.rows[0]?.last_processed_query_id || 0;
  }

  static async updateSyncState(queryId: number) {
    await pg.query(`
      UPDATE catalog.sync_state 
      SET last_processed_query_id = $1, last_synced_at = CURRENT_TIMESTAMP
    `, [queryId]);
  }

  // ---------------------------------------------------------
  // 2. Table CRUD
  // ---------------------------------------------------------
  static async upsertTable(tableName: string): Promise<number> {
    const res = await pg.query(`
      INSERT INTO catalog.tables (table_name, is_active) 
      VALUES ($1, TRUE)
      ON CONFLICT (table_name) DO UPDATE 
      SET is_active = TRUE, updated_at = CURRENT_TIMESTAMP
      RETURNING id;
    `, [tableName]);
    return res.rows[0].id;
  }

  static async updateTableSummary(tableId: number, summary: string) {
    await pg.query(`
      UPDATE catalog.tables 
      SET business_summary = $1, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $2
    `, [summary, tableId]);
  }

  // ---------------------------------------------------------
  // 3. Column & PII CRUD
  // ---------------------------------------------------------
  static async upsertColumn(tableId: number, columnName: string, dataType: string) {
    await pg.query(`
      INSERT INTO catalog.columns (table_id, column_name, data_type, is_active)
      VALUES ($1, $2, $3, TRUE)
      ON CONFLICT (table_id, column_name) DO UPDATE 
      SET data_type = $3, is_active = TRUE;
    `, [tableId, columnName, dataType]);
  }

  static async updateColumnPii(tableId: number, columnName: string, isPii: boolean, piiReason: string | null) {
    await pg.query(`
      UPDATE catalog.columns 
      SET is_pii = $1, pii_reason = $2 
      WHERE table_id = $3 AND column_name = $4;
    `, [isPii, piiReason, tableId, columnName]);
  }

  static async getTableColumns(tableId: number) {
    const res = await pg.query('SELECT * FROM catalog.columns WHERE table_id = $1 AND is_active = TRUE', [tableId]);
    return res.rows;
  }
}