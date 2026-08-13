# Ingestion Pipeline

Code: `backend/src/connectors/postgres-connector.ts`, `backend/src/core/sync-engine.ts`,
`backend/src/core/ast-parser.ts`, `backend/src/core/event-listener.ts`, `backend/src/agent/scribe-agent.ts`,
`backend/src/sync/index.ts`, `backend/src/db/*.sql`

## The problem this solves

MetaGraph needs to know, at all times, what tables and columns exist on a live company
database, which columns are PII, what each table means in plain English, and which tables
depend on which others. All four of those facts can go stale the moment someone runs a
migration or a new query. The ingestion pipeline is what keeps them current without a human
re-documenting anything by hand.

It runs as a **dual-track engine**: Track A reconciles schema state, Track B reconciles
lineage, and both are driven off the same live database.

## The four storage systems it writes to

| Store | Container | Owner module |
|---|---|---|
| Business data (read-only, ground truth) | `business-db` (Postgres, schema `target_db`) | `connectors/postgres-connector.ts` |
| Catalog: tables, columns, PII verdicts, business descriptions | `catalog-db` (Postgres, schema `catalog`) | `storage/catalog-store.ts` |
| Business-definition embeddings | `qdrant` | `storage/vector-store.ts` |
| Lineage DAG | `neo4j` | `storage/lineage-store.ts` |

MetaGraph only ever *reads* from `business-db` — every write path in this project goes
through `PostgresConnector.applyAndLog()`, which exists specifically to simulate a
migration landing on the company database from the outside (see [`execute_business_query`
in the agent runtime doc](./03-agent-runtime.md) for the one place that's exposed as a
tool call).

## Track A: schema sync (`SyncEngine.syncUp()`)

`core/sync-engine.ts`, `SyncEngine.syncUp()`. This is the "diff live schema against what we
already know" half of the engine:

```ts
static async syncUp(): Promise<SyncResult> {
  const [liveTables, storedSchema] = await Promise.all([
    businessConnector.getLiveSchema(),
    CatalogStore.getStoredSchema(),
  ]);
  ...
  for (const live of liveTables) {
    const stored = storedSchema.get(live.tableName) ?? null;
    if (!stored) { /* new table */ }
    else if (!sameColumnSet(live.columns, stored.columns)) { /* changed table */ }
    else { /* unchanged - zero cost */ }
  }
  for (const tableName of storedSchema.keys()) {
    if (!liveTableNames.has(tableName)) { /* dropped table */ }
  }
  ...
}
```

`getLiveSchema()` (`connectors/postgres-connector.ts`) reads `information_schema.columns`
directly — "zero regex parsing, 100% accurate" per its own comment. `getStoredSchema()`
(`storage/catalog-store.ts`) reads catalog-db's current state keyed by table name. The diff
is a straight set comparison: new tables, tables whose column *set* changed
(`sameColumnSet` — same length, same names, order-independent), unchanged tables (which
cost nothing further), and tables present in the catalog but absent live (dropped).

**Unchanged tables never touch the LLM.** That's the entire point of diffing first — the
Scribe Agent is only invoked for `newTables`/`changedTables`, so re-running `syncUp()`
against a stable schema is a handful of Postgres queries, not N LLM calls.

### Documenting a new or changed table

`SyncEngine.upsertTableDocumentation()`:

```ts
private static async upsertTableDocumentation(live: TableSchema, stored: StoredTable | null) {
  const tableId = await CatalogStore.upsertTable(live.tableName);
  // deactivate columns that existed before but are gone now
  for (const storedCol of stored?.columns ?? []) {
    if (!liveColumnNames.has(storedCol.columnName)) {
      await CatalogStore.deactivateColumn(tableId, storedCol.columnName);
    }
  }
  for (const col of live.columns) {
    await CatalogStore.upsertColumn(tableId, col.columnName, col.dataType);
  }
  // a column only needs a PII check if it has never been verdicted before
  const columnsNeedingPiiCheck = new Set(live.columns.map(c => c.columnName).filter(name => {
    const existing = storedColumnsByName.get(name);
    return !existing || existing.piiReason === null;
  }));

  const doc = await ScribeAgent.documentSchema(live.tableName, allColumnNames);
  await CatalogStore.updateTableSummary(tableId, doc.business_description);
  for (const colMeta of doc.column_metadata ?? []) {
    if (!columnsNeedingPiiCheck.has(colMeta.name)) continue; // never overwrite an existing verdict
    await CatalogStore.updateColumnPii(tableId, colMeta.name, !!colMeta.is_pii, ...);
  }
  await vectorStore.indexMetadata(live.tableName, doc.business_description, tableId);
}
```

Two deliberate constraints here, both load-bearing:

1. **A PII verdict is never overwritten once set.** If an admin manually corrects a PII
   classification later (not currently exposed in the UI, but the data model supports it),
   re-running Scribe on a column-changed table won't silently flip it back. Only columns
   with `piiReason === null` (never verdicted) go into `columnsNeedingPiiCheck`.
2. **One Scribe call per table, not per column.** `ScribeAgent.documentSchema(tableName,
   columns)` gets the full column list and returns both the business description and every
   column's PII verdict in one structured-JSON call — see [Scribe Agent](#the-scribe-agent).

Dropped tables get the mirror-image treatment: `CatalogStore.deactivateTable()` (soft
delete, not a hard `DELETE` — history stays queryable), `vectorStore.deleteTableContext()`,
`LineageStore.deleteTableNode()`.

## Track B: lineage from query logs (`syncLineageFromQueryLogs`)

Schema sync tells you *what* tables exist. It says nothing about *how* they relate — that
comes from watching what SQL actually ran. `business-db`'s `target_db.query_logs` table is
this project's stand-in for a query-history table (`QUERY_HISTORY` in Snowflake, `STL_QUERY`
in Redshift, etc.).

```ts
private static async syncLineageFromQueryLogs() {
  const lastWatermark = await CatalogStore.getSyncState();
  const logs = await businessConnector.getNewQueryLogs(lastWatermark);
  for (const log of logs) {
    const { target, sources } = astParser.extractDependencies(log.queryText);
    if (!target || sources.length === 0) continue;
    for (const source of sources) {
      await LineageStore.addDependency(target, source);
    }
  }
  if (logs.length > 0) {
    await CatalogStore.updateSyncState(Math.max(...logs.map(l => l.id)));
  }
}
```

`getNewQueryLogs(lastWatermark)` pulls every `query_logs` row with `id > watermark` — an
incremental, high-water-mark read, not a full table scan every time. The watermark
(`catalog.sync_state.last_processed_query_id`) only advances *after* the whole
`syncUp()` call succeeds, which is what makes a crash mid-run safe to retry: the next run
just reprocesses the same batch instead of silently skipping it.

### AST-based dependency extraction (`core/ast-parser.ts`)

```ts
extractDependencies(sql: string): LineageDependency {
  const clean = stripSqlComments(sql).trim();
  const tableList = this.parser.tableList(clean, { database: 'Postgresql' });
  // tableList() returns entries like "select::null::users" - action::db::table
  let target = '';
  const sources = new Set<string>();
  for (const entry of tableList) {
    const [action, , rawTableName] = entry.split('::');
    const tableName = this.extractTableName(rawTableName); // strips "target_db." prefix
    if (['insert', 'update', 'create', 'replace'].includes(action)) target = tableName;
    else if (action === 'select') sources.add(tableName);
  }
  sources.delete(target); // a table cannot depend on itself
  return { target, sources: Array.from(sources) };
}
```

This uses [`node-sql-parser`](https://www.npmjs.com/package/node-sql-parser)'s
`tableList()` — a real SQL AST parse, not a regex over table names, so it correctly handles
joins, subqueries, and CTEs. A query like:

```sql
CREATE TABLE target_db.stg_users AS
SELECT id, full_name, email FROM target_db.raw_users;
```

resolves to `target: "stg_users"`, `sources: ["raw_users"]`, which becomes one Neo4j edge:
`LineageStore.addDependency("stg_users", "raw_users")` →
`MERGE (stg_users)-[:DEPENDS_ON]->(raw_users)`. Parse failures (a statement the parser
can't handle) are caught and logged, not thrown — one bad statement in a batch doesn't stop
lineage extraction for the rest.

## The Scribe Agent

`agent/scribe-agent.ts`. One static method, `ScribeAgent.documentSchema(tableName,
columns)`, called only from `SyncEngine.upsertTableDocumentation()`. It asks the active LLM
provider (see [Agent Runtime](./03-agent-runtime.md#the-llm-provider-abstraction)) for
structured JSON constrained to a fixed schema:

```ts
const DOCUMENT_SCHEMA: LlmJsonSchema = {
  type: 'object',
  properties: {
    business_description: { type: 'string' },
    confidence_score: { type: 'number' },
    column_metadata: {
      type: 'array',
      items: { type: 'object', properties: {
        name: { type: 'string' }, description: { type: 'string' }, is_pii: { type: 'boolean' },
      }, required: ['name', 'description', 'is_pii'] },
    },
  },
  required: ['business_description', 'confidence_score', 'column_metadata'],
};
```

`generateJson()` is provider-agnostic — Gemini enforces this natively via
`responseSchema`/`responseMimeType: 'application/json'`; OpenRouter gets the schema spelled
out in the prompt plus `response_format: {type: 'json_object'}`, since strict
`json_schema` support isn't guaranteed across the many models OpenRouter proxies to. Either
way, `ScribeAgent` just gets back a JSON string it parses. On *any* failure — network error,
malformed JSON, empty response — it falls back to a stub rather than blocking the sync:

```ts
catch (err) {
  return {
    business_description: 'Unverified table schema.',
    confidence_score: 0.1,
    column_metadata: columns.map(c => ({ name: c, description: 'Raw column', is_pii: false })),
  };
}
```

A table that fails documentation still gets indexed with a low-confidence placeholder
rather than silently vanishing from the catalog.

## Event-driven sync: LISTEN/NOTIFY (`core/event-listener.ts`)

Running `syncUp()` on a timer works but adds latency and wastes cycles when nothing
changed. Instead, `business-db` fires a Postgres `NOTIFY` on the `metagraph_sync` channel
whenever something worth syncing happens — the triggers live in
`backend/src/db/init-target-db.sql`:

```sql
CREATE OR REPLACE FUNCTION target_db.notify_ddl_change() RETURNS event_trigger AS $$
BEGIN PERFORM pg_notify('metagraph_sync', 'ddl_change'); END;
$$ LANGUAGE plpgsql;
CREATE EVENT TRIGGER metagraph_ddl_trigger ON ddl_command_end
EXECUTE FUNCTION target_db.notify_ddl_change();

CREATE OR REPLACE FUNCTION target_db.notify_new_query() RETURNS trigger AS $$
BEGIN PERFORM pg_notify('metagraph_sync', 'new_query'); RETURN NEW; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER query_logs_notify_trigger
AFTER INSERT ON target_db.query_logs
FOR EACH ROW EXECUTE FUNCTION target_db.notify_new_query();
```

Any DDL (`CREATE`/`ALTER`/`DROP TABLE`) fires Track A's trigger; any row landing in
`query_logs` (a query "just ran") fires Track B's. `EventListener` (`core/event-listener.ts`)
holds a single dedicated (non-pooled) `pg` `Client` — deliberately not a `Pool`, because
`LISTEN`/`NOTIFY` requires a persistent connection and pooled clients get recycled between
queries, which would silently drop notifications. On each notification it debounces:

```ts
private scheduleSync(): void {
  if (this.debounceTimer) clearTimeout(this.debounceTimer);
  this.debounceTimer = setTimeout(() => this.runSync(), config.syncDebounceMs);
}
```

so a multi-statement migration (several DDL notifications in quick succession) collapses
into one `syncUp()` call instead of one per statement (`SYNC_DEBOUNCE_MS`, default 1500ms).
If a sync is already running when another notification arrives, it's queued to run once
more immediately after, rather than dropped or run concurrently. The listener also
reconnects automatically on connection loss (`RECONNECT_DELAY_MS`, 3s) and, on start, runs
one catch-up sync in case anything happened while nothing was listening.

## Entry points

| Command | What it does |
|---|---|
| `npm run cli sync` | One-shot `SyncEngine.syncUp()`, prints the result, exits. |
| `npm run cli exec <file.sql>` | Applies a `.sql` file to `business-db` via `applyAndLog()` (transactional; logs every statement to `query_logs`), which fires the triggers above. |
| `npm run sync:watch` | Long-running daemon (`sync/index.ts`) — starts `EventListener` and nothing else. This is the process `startup.sh` backgrounds as `sync-watch.log`. |
| `POST /api/sync` | Same one-shot sync, over HTTP (`server/routes/sync.ts`) — what the frontend's "Sync now" button calls. |
| `POST /api/exec` | Same as `cli exec`, over HTTP (`server/routes/exec.ts`) — what the frontend's "Apply SQL" button calls. |

`applyAndLog()` (`connectors/postgres-connector.ts`) is the single choke point for every
write this project makes against `business-db`: it splits the input into statements, runs
them in one transaction, and logs each one to `query_logs` in the same transaction — so a
`CREATE TABLE ... AS SELECT` applied through it gets both its schema change *and* its
lineage edge for free, with no separate manual `query_logs` insert required anywhere else
in the codebase.
