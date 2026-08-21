import { businessConnector, type TableSchema } from '../connectors/postgres-connector.js';
import { CatalogStore, type StoredTable } from '../storage/catalog-store.js';
import { LineageStore } from '../storage/lineage-store.js';
import { vectorStore } from '../storage/vector-store.js';
import { ScribeAgent } from '../agent/scribe-agent.js';
import { ASTParser } from './ast-parser.js';

const astParser = new ASTParser();

export interface SyncResult {
  newTables: string[];
  changedTables: string[];
  unchangedTables: string[];
  droppedTables: string[];
  queryLogsProcessed: number;
  lineageEdgesAdded: number;
}

/** True if a live table's columns exactly match the set already stored in catalog-db. */
function sameColumnSet(live: TableSchema['columns'], stored: StoredTable['columns']): boolean {
  if (live.length !== stored.length) return false;
  const storedNames = new Set(stored.map(c => c.columnName));
  return live.every(col => storedNames.has(col.columnName));
}

/**
 * The "syncUp" contract (see detailed_working/01-ingestion-pipeline.md):
 *  1. Diff live business schema (information_schema) against catalog-db.
 *  2. NEW/CHANGED tables -> Scribe Agent for business defs + PII tagging on
 *     NEW columns only (never overwrite an existing PII verdict).
 *  3. Re-index Qdrant for anything whose business description changed;
 *     delete Qdrant points for tables dropped from the live database.
 *  4. Track B: pull new query_logs rows since the watermark, extract
 *     dependencies via the AST parser, and write DEPENDS_ON edges to Neo4j.
 *  5. Advance the sync watermark last, so a crash mid-run is safe to retry.
 */
export class SyncEngine {
  /** Runs one full sync pass: diffs schema, documents/PII-tags changed tables, and syncs lineage from query logs. */
  static async syncUp(): Promise<SyncResult> {
    const [liveTables, storedSchema] = await Promise.all([
      businessConnector.getLiveSchema(),
      CatalogStore.getStoredSchema(),
    ]);

    const liveTableNames = new Set(liveTables.map(t => t.tableName));

    const newTables: string[] = [];
    const changedTables: string[] = [];
    const unchangedTables: string[] = [];
    const droppedTables: string[] = [];

    for (const live of liveTables) {
      const stored = storedSchema.get(live.tableName) ?? null;

      if (!stored) {
        await SyncEngine.upsertTableDocumentation(live, null);
        newTables.push(live.tableName);
        continue;
      }

      if (!sameColumnSet(live.columns, stored.columns)) {
        await SyncEngine.upsertTableDocumentation(live, stored);
        changedTables.push(live.tableName);
      } else {
        unchangedTables.push(live.tableName);
      }
    }

    // Anything still marked active in catalog-db but absent from the live
    // schema has been dropped from the business database.
    for (const tableName of storedSchema.keys()) {
      if (!liveTableNames.has(tableName)) {
        await CatalogStore.deactivateTable(tableName);
        await vectorStore.deleteTableContext(tableName);
        await LineageStore.deleteTableNode(tableName);
        droppedTables.push(tableName);
      }
    }

    const { processed: queryLogsProcessed, edgesAdded: lineageEdgesAdded } = await SyncEngine.syncLineageFromQueryLogs();

    return { newTables, changedTables, unchangedTables, droppedTables, queryLogsProcessed, lineageEdgesAdded };
  }

  /**
   * Documents a NEW or COLUMN-CHANGED table: upserts catalog-db rows, calls
   * the Scribe Agent for a fresh business description + PII verdicts, but
   * only persists PII verdicts for columns that don't already have one.
   */
  private static async upsertTableDocumentation(live: TableSchema, stored: StoredTable | null): Promise<void> {
    const tableId = await CatalogStore.upsertTable(live.tableName);

    const liveColumnNames = new Set(live.columns.map(c => c.columnName));
    for (const storedCol of stored?.columns ?? []) {
      if (!liveColumnNames.has(storedCol.columnName)) {
        await CatalogStore.deactivateColumn(tableId, storedCol.columnName);
      }
    }

    for (const col of live.columns) {
      await CatalogStore.upsertColumn(tableId, col.columnName, col.dataType);
    }

    // A column only needs a PII check if it has never been verdicted before.
    const storedColumnsByName = new Map((stored?.columns ?? []).map(c => [c.columnName, c]));
    const columnsNeedingPiiCheck = new Set(
      live.columns
        .map(c => c.columnName)
        .filter(name => {
          const existing = storedColumnsByName.get(name);
          return !existing || existing.piiReason === null;
        }),
    );

    const allColumnNames = live.columns.map(c => c.columnName);
    const doc = await ScribeAgent.documentSchema(live.tableName, allColumnNames);

    await CatalogStore.updateTableSummary(tableId, doc.business_description);

    for (const colMeta of doc.column_metadata ?? []) {
      if (!columnsNeedingPiiCheck.has(colMeta.name)) continue;
      const piiReason = colMeta.is_pii ? (colMeta.description || 'Flagged as PII by Scribe Agent') : null;
      await CatalogStore.updateColumnPii(tableId, colMeta.name, !!colMeta.is_pii, piiReason);
    }

    await vectorStore.indexMetadata(live.tableName, doc.business_description, tableId);
  }

  /**
   * Track B of the dual-track engine: pulls query_logs rows written since
   * the last watermark, extracts source/target dependencies via the AST
   * parser, and writes them into the Neo4j lineage DAG.
   */
  private static async syncLineageFromQueryLogs(): Promise<{ processed: number; edgesAdded: number }> {
    const lastWatermark = await CatalogStore.getSyncState();
    const logs = await businessConnector.getNewQueryLogs(lastWatermark);

    let edgesAdded = 0;
    for (const log of logs) {
      const { target, sources } = astParser.extractDependencies(log.queryText);
      if (!target || sources.length === 0) continue;

      for (const source of sources) {
        await LineageStore.addDependency(target, source);
        edgesAdded++;
      }
    }

    if (logs.length > 0) {
      const maxId = Math.max(...logs.map(l => l.id));
      await CatalogStore.updateSyncState(maxId);
    }

    return { processed: logs.length, edgesAdded };
  }
}
