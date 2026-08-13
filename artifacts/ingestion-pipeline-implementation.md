# Ingestion Pipeline Implementation

**Date**: 2026-08-13
**Scope**: Full implementation of the dual-track ingestion pipeline described in `ingestion.md`, plus the docker-compose infra it depends on.

---

## 1. Why this was needed

The backend did not compile. `metadata-store.ts` was imported by 10+ files (every REST route, both MCP server files, the CLI) but the file never existed in the repo. There was also a second broken import (`core/vector-store.js`, which lives at `storage/vector-store.js`), and `docker-compose.yml` had a single Postgres container doing double duty as both the "company business data" store and the "project catalog" store, which the architecture explicitly calls out as two separate storages.

**Decision made**: rather than recreating an in-memory `metadata-store` cache, every consumer now reads directly from the real stores of record — Postgres (catalog), Neo4j (lineage), Qdrant (vectors) — per `ingestion.md`'s own model. This avoids building a cache layer that duplicates what those three databases already are.

---

## 2. Infrastructure changes

### docker-compose.yml — split into the 4 storages `ingestion.md` calls for

| Container | Role | Host port |
|---|---|---|
| `business-db` | Live company database (simulated) | `5433` |
| `catalog-db` | MetaGraph's own catalog (tables/cols/PII) | `5434`* |
| `neo4j` | Lineage DAG | `7474` / `7687` |
| `qdrant` | Vector embeddings | `6333` / `6334` |

\* Originally mapped to `5432`, but an unrelated pre-existing container on this machine (`sui_postgres_db`, a different project) already held that port. Remapped `catalog-db` to `5434` rather than touching that container.

Each Postgres container now only mounts its own init script (`init-target-db.sql` → `business-db`, `init-catalog.sql` → `catalog-db`) — previously both scripts ran against the same container.

### init-target-db.sql — event-driven triggers (added after the seed data, so seeding doesn't fire spurious notifications)

- `metagraph_ddl_trigger` — a Postgres **event trigger** on `ddl_command_end`, fires on any `CREATE/ALTER/DROP TABLE`
- `query_logs_notify_trigger` — a row trigger on `INSERT INTO target_db.query_logs`

Both call `pg_notify('metagraph_sync', ...)`. This is what makes syncing event-driven instead of polled.

---

## 3. New files

| File | Purpose |
|---|---|
| `backend/src/core/sync-engine.ts` | `SyncEngine.syncUp()` — the heart of the pipeline (see §4) |
| `backend/src/core/event-listener.ts` | Dedicated `pg` `Client` that `LISTEN`s on `metagraph_sync`, debounces bursts, calls `syncUp()`, reconnects on drop |
| `backend/src/sync/index.ts` | Entrypoint: `npm run sync` (one-shot) / `npm run sync:watch` (event-driven, long-running) |
| `backend/src/server/routes/sync.ts` | `POST /api/sync` — manual REST trigger for `syncUp()` |

---

## 4. `SyncEngine.syncUp()` — what it actually does

1. Fetches live schema from `business-db` (`information_schema`) and current state from `catalog-db`.
2. Classifies every table as **NEW**, **CHANGED** (columns added/removed), **UNCHANGED**, or **DROPPED**.
3. **NEW/CHANGED** → upserts the table/columns in `catalog-db`, calls the Scribe Agent for a business description, re-indexes the table's vector in Qdrant. Only columns that have **never** had a PII verdict get one written — an existing verdict is never overwritten by a re-run.
4. **UNCHANGED** → does nothing. No LLM call. (Verified: a no-op re-sync makes zero Scribe calls.)
5. **DROPPED** → soft-deletes the table/columns in `catalog-db` (`is_active = false`), deletes its Qdrant point, deletes its Neo4j node.
6. Separately, pulls any `query_logs` rows written since the last watermark, extracts dependencies via the existing AST parser, and writes `DEPENDS_ON` edges into Neo4j.
7. Advances the sync watermark **last**, so a crash mid-run is safe to retry (nothing is marked "processed" until it's actually persisted).

Qdrant points now store `tableId` in their payload — the join key back to `catalog-db` for pulling columns/PII at read time (previously the vector store only stored `tableName` + description, with no way to hydrate columns).

---

## 5. Modified files

| File | Change |
|---|---|
| `config/env.ts` | Centralized **all** env reads here (catalog DB, business DB, Neo4j, Qdrant, debounce interval). Previously `postgres.ts`/`neo4j.ts`/`vector-store.ts` each read `process.env` directly, which is fragile once there are two Postgres connections to keep straight. |
| `config/postgres.ts` | Now points at `catalog-db` specifically, via `config.catalogDb`. |
| `config/neo4j.ts` | Reads from `config.neo4j` instead of raw env vars. |
| `connectors/postgres-connector.ts` | Defaults to `business-db`'s connection string; exports a `businessConnector` singleton. |
| `storage/catalog-store.ts` | Added `getStoredSchema()` (for diffing), `deactivateTable()`/`deactivateColumn()` (soft-delete), `getAllTables()`, `getTableByName()`, `purge()`. |
| `storage/lineage-store.ts` | Added `getUpstream()`, `getFullGraph()` (nodes/edges for the frontend graph view), `deleteTableNode()`, `purge()`. Renamed `getDownstreamImpact` → `getDownstream` for symmetry with `getUpstream`. |
| `storage/vector-store.ts` | Reads Qdrant URL from `config.qdrant`; `indexMetadata()` now takes and stores `tableId`; `searchSemantic()` returns it too. |
| `core/ast-parser.ts` | Fixed a pre-existing bug unrelated to this task but blocking every run: `node-sql-parser`'s CJS bundle isn't statically analyzable by Node's ESM loader, so `import { Parser }` failed at runtime. Switched to a default import + runtime destructure. |

---

## 6. Rewired consumers (the metadata-store fallout)

Every file that imported the nonexistent `metadata-store` now reads directly from the real stores:

- `server/app.ts`, `mcp/server.ts` — dropped the store import/hydration step entirely (nothing to hydrate anymore)
- `mcp/tools/get-lineage.ts`, `mcp/tools/get-governed-schema.ts` — now call `LineageStore`/`CatalogStore` directly
- `mcp/tools/search-metadata.ts`, `server/routes/ask.ts` — fixed the broken import path, and now hydrate each Qdrant hit's columns (via `tableId` → `CatalogStore`) and lineage (via `LineageStore`) at query time, which the old code referenced but never actually populated
- `server/routes/catalog.ts`, `governance.ts`, `lineage.ts`, `purge.ts` — rewritten against `CatalogStore`/`LineageStore`/`vectorStore`. Response shapes were kept identical to what the frontend already expects, so no frontend changes were needed.

## 7. Repurposed: `/api/ingest` and the CLI

Table schemas, business descriptions, and PII tags now come **exclusively** from `syncUp()` (Track A — the live `business-db`). Pasted/uploaded SQL is no longer a second, competing way to write those same fields.

- `POST /api/ingest` (and `npm run cli ingest <file>`) now do **lineage-only extraction** (Track B — "SQL Migration / dbt Files → AST Lineage Extraction" per the architecture diagram): they parse the SQL for dependencies and write `DEPENDS_ON` edges to Neo4j, nothing else. The frontend's existing Ingest tab (paste SQL → "Run pipeline") keeps working unmodified since the request/response contract didn't change.
- `npm run cli sync` — thin wrapper around `SyncEngine.syncUp()`.

---

## 8. Verification performed

- `tsc --noEmit` and `npm run build` — clean
- `docker compose up -d` — all 4 containers healthy
- `npm run sync` (cold start) — 3 tables picked up, Scribe-documented, PII-tagged, indexed in Qdrant with `tableId`, 1 lineage edge written to Neo4j, watermark advanced to `2`
- Re-ran `npm run sync` — all 3 tables reported UNCHANGED, **zero** LLM calls
- `npm run sync:watch` + live `ALTER TABLE raw_users ADD COLUMN phone` on `business-db` — listener received the DDL notification, synced automatically within ~2s, re-documented **only** `raw_users`, added a PII verdict for `phone`, left `full_name`/`email`/`ssn`'s existing verdicts untouched
- Live `INSERT INTO query_logs` — fired the `new_query` notification, extracted a new lineage edge automatically
- Live `CREATE TABLE` + `DROP TABLE` in quick succession — exercised the debounce/requeue path: the first sync (processing the CREATE) was still in flight when the DROP's notification arrived, so it correctly queued a second sync rather than dropping the event, and the drop was picked up on that second pass
- `POST /api/sync`, `GET /api/catalog`, `GET /api/lineage`, `GET /api/governance/:table`, `POST /api/ingest` — all hit manually against the running server, correct data returned, RBAC redaction confirmed on the `ANALYST` role

---

## 9. Known gaps (not in scope for this pass)

- No AI agent skills/runtime (SQL-writing skill, multi-step agent loop) — still architecture-only
- No frontend visualization of the context layer (catalog/Neo4j/Qdrant browsers) or business-data entry UI — still architecture-only
- These were called out in the earlier `artifacts/repo-findings.md` audit and remain unaddressed; this pass was scoped to the ingestion pipeline + docker-compose only, per what was asked.
