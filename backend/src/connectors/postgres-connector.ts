import { Pool } from "pg";
import { config, businessDbConnectionString } from "../config/env.js";

export interface ColumnSchema {
  columnName: string;
  dataType: string;
}

export interface TableSchema {
  tableName: string;
  columns: ColumnSchema[];
}

export interface QueryLog {
  id: number;
  queryText: string;
  executedAt: Date;
}

export class PostgresConnector {
  private pool: Pool;
  private schemaName: string;

  constructor(connectionString: string = businessDbConnectionString(), schemaName: string = config.businessDb.schema) {
    // Connects to the live company database (business-db container). Reads
    // back its schema/query_logs for ingestion; the only write path is
    // applyAndLog() below, used by /api/exec and the execute_business_query
    // tool. See detailed_working/01-ingestion-pipeline.md.
    this.pool = new Pool({ connectionString });
    this.schemaName = schemaName;
  }

  /**
   * Fetches the absolute ground-truth live state of the database.
   * Zero regex parsing - 100% accurate.
   */
  async getLiveSchema(): Promise<TableSchema[]> {
    const res = await this.pool.query(
      `
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = $1
      ORDER BY table_name, ordinal_position;
    `,
      [this.schemaName],
    );

    const tablesMap = new Map<string, ColumnSchema[]>();

    for (const row of res.rows) {
      const tableName = row.table_name;
      if (!tablesMap.has(tableName)) {
        tablesMap.set(tableName, []);
      }
      tablesMap.get(tableName)!.push({
        columnName: row.column_name,
        dataType: row.data_type,
      });
    }

    return Array.from(tablesMap.entries()).map(([tableName, columns]) => ({
      tableName,
      columns,
    }));
  }

  /**
   * Fetches unparsed migration logs based on the High-Water Mark.
   * This simulates reading from Snowflake's QUERY_HISTORY view.
   */
  async getNewQueryLogs(lastProcessedId: number): Promise<QueryLog[]> {
    const res = await this.pool.query(
      `
      SELECT id, query_text, executed_at
      FROM ${this.schemaName}.query_logs
      WHERE id > $1
      ORDER BY id ASC;
    `,
      [lastProcessedId],
    );

    return res.rows.map((row) => ({
      id: row.id,
      queryText: row.query_text,
      executedAt: row.executed_at,
    }));
  }

  /**
   * Applies each statement in the given SQL to the business database AND
   * records it in query_logs - used only by /api/exec and `npm run cli exec`
   * to simulate a migration/query landing on the live business DB.
   *
   * Track A (schema sync) only reads information_schema, so it never learns
   * what SELECT produced a table's columns. Track B (lineage) only reads
   * query_logs. Logging every applied statement here means a CREATE TABLE
   * AS SELECT applied through this method gets a lineage edge automatically,
   * with no separate manual query_logs INSERT required.
   *
   * All statements run in one transaction - if any fails, nothing is
   * applied or logged.
   */
  async applyAndLog(sql: string): Promise<{ statementsApplied: number }> {
    const statements = sql.split(';').map(s => s.trim()).filter(Boolean);
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      for (const statement of statements) {
        await client.query(statement);
        await client.query(
          `INSERT INTO ${this.schemaName}.query_logs (query_text) VALUES ($1);`,
          [statement],
        );
      }
      await client.query('COMMIT');
      return { statementsApplied: statements.length };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

export const businessConnector = new PostgresConnector();
