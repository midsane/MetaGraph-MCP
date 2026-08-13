import { pg } from '../config/postgres.js';

export interface StoredColumn {
  columnName: string;
  dataType: string;
  isPii: boolean;
  piiReason: string | null;
}

export interface StoredTable {
  id: number;
  tableName: string;
  businessSummary: string | null;
  columns: StoredColumn[];
}

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

  // ---------------------------------------------------------
  // 4. Sync diffing & soft-deletes
  // ---------------------------------------------------------

  /**
   * Current active state of the catalog (project postgres), keyed by table
   * name, used to diff against the live business schema during syncUp().
   */
  static async getStoredSchema(): Promise<Map<string, StoredTable>> {
    const res = await pg.query(`
      SELECT
        t.id AS table_id, t.table_name, t.business_summary,
        c.column_name, c.data_type, c.is_pii, c.pii_reason
      FROM catalog.tables t
      LEFT JOIN catalog.columns c ON c.table_id = t.id AND c.is_active = TRUE
      WHERE t.is_active = TRUE
      ORDER BY t.table_name;
    `);

    const tables = new Map<string, StoredTable>();
    for (const row of res.rows) {
      let table = tables.get(row.table_name);
      if (!table) {
        table = { id: row.table_id, tableName: row.table_name, businessSummary: row.business_summary, columns: [] };
        tables.set(row.table_name, table);
      }
      if (row.column_name) {
        table.columns.push({
          columnName: row.column_name,
          dataType: row.data_type,
          isPii: row.is_pii,
          piiReason: row.pii_reason,
        });
      }
    }
    return tables;
  }

  static async getAllTables() {
    const res = await pg.query(`
      SELECT id, table_name, business_summary, updated_at
      FROM catalog.tables
      WHERE is_active = TRUE
      ORDER BY table_name;
    `);
    return res.rows;
  }

  static async getTableByName(tableName: string) {
    const res = await pg.query(`
      SELECT id, table_name, business_summary
      FROM catalog.tables
      WHERE table_name = $1 AND is_active = TRUE;
    `, [tableName]);
    return res.rows[0] || null;
  }

  /**
   * Soft-deletes a table dropped from the live business database, along
   * with all of its columns.
   */
  static async deactivateTable(tableName: string) {
    await pg.query(`
      UPDATE catalog.tables SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
      WHERE table_name = $1;
    `, [tableName]);
    await pg.query(`
      UPDATE catalog.columns SET is_active = FALSE
      WHERE table_id = (SELECT id FROM catalog.tables WHERE table_name = $1);
    `, [tableName]);
  }

  /**
   * Soft-deletes a single column dropped from a still-existing table.
   */
  static async deactivateColumn(tableId: number, columnName: string) {
    await pg.query(`
      UPDATE catalog.columns SET is_active = FALSE
      WHERE table_id = $1 AND column_name = $2;
    `, [tableId, columnName]);
  }

  /** Wipes the catalog and resets the sync watermark. Used by /api/purge. */
  static async purge() {
    await pg.query('TRUNCATE catalog.columns, catalog.tables RESTART IDENTITY CASCADE;');
    await pg.query('UPDATE catalog.sync_state SET last_processed_query_id = 0, last_synced_at = CURRENT_TIMESTAMP;');
  }
}