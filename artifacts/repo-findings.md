# MetaGraph-MCP: Architecture vs Implementation Analysis

**Last Updated**: 2026-08-13  
**Overall Status**: ~45% complete | Core infrastructure partially broken | Critical blockers identified

---

## Executive Summary

Your codebase implements ~45% of the target architecture. While the foundational pieces (databases, API routes, MCP server, frontend components) exist, several **critical files are missing**, breaking compilation. The ingestion pipeline is partially functional, but event-driven syncs, AI agent runtime with skills, and full context layer visualization are not yet implemented.

---

## 1. ARCHITECTURE LAYER MAPPING

### 1.1 Ingestion Pipeline (Status: ~50% COMPLETE)

#### ✅ Implemented
- **Connector Layer**: `PostgresConnector` exists with `getLiveSchema()` and `getNewQueryLogs()` methods
  - Fetches ground-truth table schemas from information_schema
  - Reads query logs from target_db.query_logs
- **AST Parser**: `ASTParser` class uses node-sql-parser to extract dependencies
  - Handles basic CREATE TABLE and CTAS patterns
  - Extracts target table & source dependencies
- **Scribe Agent**: LLM-based documentation generator
  - Takes table names + columns → generates business_description, confidence_score, column_metadata with PII flags
  - Uses Gemini Flash for JSON schema generation
- **Ingest Route** (`/api/ingest`):
  - Accepts raw SQL via POST
  - Strips comments, parses DDL, extracts lineage, triggers Scribe Agent
  - Returns ingested tables with metadata

#### ❌ Missing / Broken
1. **CRITICAL**: `metadata-store.ts` does not exist
   - Imported by: 10+ files (all routes, MCP server, CLI)
   - Breaking the entire compilation
   - Should hold in-memory cache of tables, columns, lineage graph, and provide methods like:
     - `loadFromDb()`, `saveTableMetadata()`, `addLineageDependency()`, `purge()`
     - Memory structures: `tableMetadata: Map<string, TableMetadata>`, `dag: DirectedAcyclicGraph`

2. **CRITICAL**: AST Parser incomplete
   - Methods referenced in CLI but not implemented:
     - `extractDDLSchemas()` - should return array of DDL entries (CREATE, ALTER_ADD, etc.)
   - Regex fallback in ingest route is limited (doesn't handle complex DDL)

3. **Missing**: Event-driven syncup mechanism
   - No background job/scheduler to trigger connector.getLiveSchema() on DB changes
   - No webhook or polling mechanism
   - Architecture requires: "event-driven way to call syncup in the background when live company database changes"

4. **Missing**: Dual-track processing
   - Ingestion should simultaneously track: (a) ground truth schema changes, (b) query logs for lineage
   - Currently only processes inbound SQL, not live schema diffs

5. **Incomplete**: Vector DB indexing in ingestion
   - Scribe Agent generates metadata but embedding storage happens elsewhere
   - Should auto-index embeddings to Qdrant during Scribe generation

#### Data Persistence Status
- **Postgres**: Schema initialized (init-catalog.sql exists) but catalog store methods are not wired to ingest route
- **Neo4j**: Driver config exists but lineage edges are only added in-memory (not persisted)
- **Qdrant**: Vector store exists but search_metadata tool references undefined column metadata

---

### 1.2 Context Layer (Status: ~40% COMPLETE)

#### ✅ Implemented
- **Postgres (Catalog Store)**:
  - Tables exist: `catalog.tables`, `catalog.columns`, `catalog.sync_state`
  - CRUD methods exist but not integrated with ingest pipeline
  - PII columns can be marked with `is_pii` flag

- **Neo4j (Lineage Graph)**:
  - Driver configured with connection string
  - `LineageStore` class has methods:
    - `addDependency(target, source)` - adds DEPENDS_ON edge
    - `getDownstreamImpact(tableName)` - traverses DAG for impacted tables
  - Can traverse recursive lineage with Cypher

- **Qdrant (Vector RAG)**:
  - Collection management implemented
  - Embedding generation via Gemini
  - Semantic search working
  - BUT: Returns only tableName + business_description; missing column metadata & lineage hydration at query time

- **RBAC/Masking Layer**:
  - `get_governed_schema` MCP tool implements PII redaction
  - `/api/governance` endpoint enforces ANALYST vs ADMIN role filtering
  - Frontend allows role selection (Admin/Analyst toggle)
  - BUT: Role enforcement is inconsistent (some routes skip role check)

- **MCP Server**:
  - 3 tools exposed: `get_lineage`, `get_governed_schema`, `search_business_glossary`
  - Hydrates from store on startup
  - Serves Claude Desktop, Cursor, and external AI agents

#### ❌ Missing / Broken
1. **CRITICAL**: Metadata-store missing
   - Blocks hydration of all context layer data into memory
   - Cannot perform O(1) lookups or traversals

2. **Incomplete**: Column metadata hydration
   - `search_metadata` tool returns tableName + business_desc but tries to attach undefined `columns`, `upstream_dependencies`, `downstream_dependents`
   - Vector search doesn't join with Postgres or Neo4j at query time

3. **Missing**: Materialized lineage views
   - Neo4j graph exists but `get_lineage` tool references in-memory DAG instead
   - Should traverse Neo4j at query time, not memory cache

4. **Missing**: Sync state tracking
   - `catalog.sync_state` table exists but not updated by ingestion process
   - No high-water mark management for incremental syncs

---

### 1.3 AI Agent Runtime (Status: ~30% COMPLETE)

#### ✅ Implemented
- **Single-turn RAG loop** (`/api/ask`):
  - Accepts query + userRole
  - Performs vector search
  - Applies RBAC PII redaction
  - Generates response via Gemini Flash with system instruction
  - Returns answer + matched tables

- **MCP Tool Access**:
  - External AI agents (Claude Desktop, Cursor) can access 3 MCP tools
  - Tools have proper schemas and descriptions

#### ❌ Missing / Broken
1. **CRITICAL**: No skill-based agent runtime
   - Architecture specifies: "inhouse while loop (ai agent runtime) → accepts user query → has access to MCP tools → has a skill: write sql query"
   - No orchestration layer for multi-step agent reasoning
   - No skill definitions for SQL query writing with downstream impact checks

2. **Missing**: SQL query generation skill
   - No endpoint or agent that writes governed SQL queries
   - No mechanism to check downstream impact before generating queries
   - No validation against RBAC/PII policies before query execution

3. **Missing**: Skill instruction directives
   - No guidance system for agent to "check downstream impact via lineage DAG before writing a query"

4. **Frontend**: No agent interaction UI
   - RAG section only does search, not agentic query generation
   - No conversation history or multi-turn support
   - No visualization of agent reasoning steps

---

### 1.4 Frontend UI (Status: ~60% COMPLETE)

#### ✅ Implemented
- **Sidebar Navigation**: 4 tabs (Ingest, Lineage, Governance, RAG)
- **Ingest Section**:
  - SQL textarea for pasting migrations
  - Run pipeline button
  - PII pre-scan with flagged column names
  - Ingestion logs display
  - Stats: Lines of SQL, statements queued, tables in catalog, PII count
- **Lineage Section**:
  - Fetches `/api/lineage` graph data
  - Renders DAG visualization (LineageGraph component)
  - Table refresh support
- **Governance Section**:
  - Table selector dropdown
  - Role toggle (Admin/Analyst)
  - Column list with PII indicators
  - RBAC-based column redaction
- **RAG Section**:
  - Search query input with suggestions
  - Role toggle
  - Answer rendering with formatting
  - Matched tables display

#### ❌ Missing / Broken
1. **Missing**: Context layer visualization sections
   - Architecture specifies UI section showing: "project postgres tables, neo4j DAG, vector DB embeddings"
   - No tabs to view:
     - Catalog schema (tables/columns stored in project postgres)
     - Neo4j graph visualization (nodes/edges/relationships)
     - Vector embeddings (metadata with business descriptions)

2. **Missing**: Business postgres data entry section
   - Architecture specifies: "section where we can make business postgres data entry in the frontend → option to make changes → see how context layer updated live"
   - No UI for entering/editing data in target_db (raw_users, stg_users, etc.)
   - No live refresh mechanism when target DB changes

3. **Missing**: SQL query writing UI
   - No interface to generate SQL queries through agent
   - No query execution preview
   - No downstream impact warning

4. **Incomplete**: Visualization components
   - LineageGraph component exists but implementation unclear
   - No Neo4j graph renderer
   - No vector embedding visualizer

---

## 2. MISSING/BROKEN COMPONENTS (Priority Order)

### 🔴 CRITICAL BLOCKERS
1. **metadata-store.ts** (File not found)
   - Used by: app.ts, all routes, MCP server, CLI
   - Blocks: Compilation, all runtime functionality
   - Action: Create with:
     ```typescript
     export class MetadataStore {
       tableMetadata: Map<string, TableMetadata>
       dag: DAGGraph  // in-memory lineage
       
       async loadFromDb(): void  // hydrate from Qdrant, Postgres, Neo4j
       async saveTableMetadata(table, cols, doc): void
       async addLineageDependency(target, source): void
       getMetadata(tableName): TableMetadata
       getSchema(tableName): ColumnSchema[]
       purge(): void
     }
     ```

2. **DAG/Graph implementation** (Not properly wired)
   - AST parser extracts dependencies but store.dag doesn't exist
   - LineageStore methods exist but not called from ingest route
   - Action: Implement in-memory DAG or wire Neo4j queries

3. **AST Parser incomplete**
   - `extractDDLSchemas()` method referenced but not implemented
   - Regex fallback in ingest.ts is too simple
   - Action: Extend parser to handle ALTER TABLE, DROP, constraint definitions

### 🟠 HIGH PRIORITY
4. **Event-driven ingestion**
   - No scheduled sync or webhook listener
   - Action: Add cron job or polling mechanism to trigger `syncup()` endpoint

5. **AI Agent skills framework**
   - No multi-step agent orchestration
   - No skill definitions for SQL writing
   - Action: Create agent runtime with skill instruction templating

6. **Frontend context layer tabs**
   - No visualization of stored metadata (postgres/neo4j/qdrant)
   - Action: Add 3 new frontend sections with data viewers

### 🟡 MEDIUM PRIORITY
7. **Vector search hydration**
   - search_metadata tool tries to return columns/lineage but they're not fetched
   - Action: Modify vector search to join with Postgres + Neo4j

8. **Role enforcement inconsistency**
   - Some endpoints check userRole, others don't
   - Action: Add middleware for consistent RBAC

9. **Business data entry UI**
   - No way to modify target_db tables through frontend
   - No live refresh on DB changes
   - Action: Create data entry form section with CRUD ops

---

## 3. OBSOLETE/REDUNDANT CODE

### Files Marked as Deleted (git status)
- `Dual_Track_Ingestion_Engine.md` - Old architecture doc
- `version1-architecture.md` - Superseded by architecture.md
- `version2-architecture.md` - Superseded by architecture.md

### Incomplete/Unused Code
- `postgres-connector.ts`:
  - `getNewQueryLogs()` method exists but not called by any route
  - Should be wired to dual-track ingestion with schema comparison

- `ASTParser`:
  - Only `extractDependencies()` is used
  - `extractDDLSchemas()` referenced in CLI but undefined

- Frontend components:
  - `LineageGraph.tsx` rendered but unclear if it displays actual neo4j data or mock

---

## 4. CURRENT PROGRESS TO TARGET

### What's Working
```
✅ Database setup (Postgres, Neo4j, Qdrant containers via docker-compose)
✅ Schema ingestion (tables/columns extracted from CREATE TABLE)
✅ Basic lineage extraction (AST parser identifies target→source deps)
✅ Business definition generation (Scribe Agent via Gemini)
✅ Vector search (Qdrant semantic search working)
✅ RBAC PII masking (Frontend + governance endpoints enforce roles)
✅ MCP server (3 tools exported for external AI)
✅ REST API (6 routes: ingest, ask, catalog, governance, lineage, purge)
✅ Frontend UI (4 sections with basic functionality)
```

### What's Broken
```
❌ Compilation (metadata-store.ts missing)
❌ In-memory state hydration (store undefined)
❌ Lineage persistence (Neo4j not updated during ingest)
❌ Column metadata retrieval (search_metadata references undefined fields)
❌ Event-driven sync (no background job)
```

### What's Not Implemented
```
❌ AI agent skills framework (no SQL query generation skill)
❌ Multi-step agent reasoning (only single-turn RAG)
❌ Frontend context visualization (no postgres/neo4j/qdrant viewers)
❌ Business data entry (no target_db UI)
❌ Incremental sync tracking (sync_state not managed)
❌ Dual-track processing (only SQL-based, not schema diffs)
```

---

## 5. ARCHITECTURE FULFILLMENT SCORECARD

| Component | Target | Status | % | Notes |
|-----------|--------|--------|---|-------|
| **Ingestion: Schema Sync** | Connector + Sync-up | 50% | Schema fetching works, sync tracking missing |
| **Ingestion: Query Log Processing** | Extract dependencies from logs | 40% | Parser works but logs not processed from DB |
| **Ingestion: Scribe Agent** | Generate business defs + PII tag | 80% | Gemini integration working, not auto-indexed |
| **Storage: Postgres** | Catalog CRUD | 70% | Schema exists, not wired to ingestion |
| **Storage: Neo4j** | Lineage DAG persistence | 30% | Driver exists, edges not persisted during ingest |
| **Storage: Qdrant** | Vector search | 70% | Search works but doesn't return rich context |
| **Context: RBAC Masking** | PII redaction layer | 70% | Implemented in frontend + governance, inconsistent |
| **Context: MCP Tools** | 3 tools (lineage, schema, search) | 70% | Tools exist but reference missing data |
| **AI Runtime: Agent Loop** | Multi-step orchestration | 0% | Only single-turn RAG |
| **AI Runtime: Skills** | SQL query writing skill | 0% | No skill definitions |
| **Frontend: Ingest UI** | SQL editor + run button | 100% | Fully implemented |
| **Frontend: Lineage Viz** | DAG rendering | 60% | Component exists, data source unclear |
| **Frontend: Governance UI** | RBAC + column masking | 90% | Table/role selector works |
| **Frontend: RAG UI** | Search + answer | 80% | Works but no multi-turn |
| **Frontend: Context Viz** | Show postgres/neo4j/qdrant data | 0% | Not implemented |
| **Frontend: Data Entry** | Edit target_db through UI | 0% | Not implemented |

**Overall Architecture Implementation: ~45%**

---

## 6. RECOMMENDED NEXT STEPS (Priority Order)

### Phase 1: Fix Compilation (1-2 days)
1. Create `metadata-store.ts` with full in-memory cache + persistence methods
2. Implement missing `ASTParser.extractDDLSchemas()`
3. Wire `CatalogStore` methods to ingest route
4. Connect lineage graph to Neo4j during ingestion

### Phase 2: Complete Ingestion Pipeline (2-3 days)
1. Add event-driven sync mechanism (cron job or webhook)
2. Implement dual-track processing (schema + query logs simultaneously)
3. Auto-index vectors during Scribe Agent generation
4. Add sync_state watermark management

### Phase 3: AI Agent Skills (3-4 days)
1. Build agent orchestration framework with skill definitions
2. Implement SQL query writing skill with downstream impact checking
3. Add multi-turn conversation support
4. Create frontend agent interface

### Phase 4: Frontend Context Visualization (2-3 days)
1. Add postgres catalog viewer (tables/columns/PII)
2. Add Neo4j graph visualization
3. Add vector embedding browser
4. Add business data entry forms with live sync

### Phase 5: Polish & Testing (1-2 days)
1. Consistent RBAC enforcement across all endpoints
2. End-to-end testing of dual-track ingestion
3. Performance optimization for large schemas

---

## 7. TECHNICAL DEBT & QUALITY ISSUES

### Code Quality
- **No error handling** in routes (swallow errors, return 500)
- **Inconsistent imports** (some .js, some relative paths)
- **No TypeScript strict mode** (type inference issues)
- **CLI references undefined store methods** (never tested)

### Architecture Issues
- **No request/response schemas** (OpenAPI docs incomplete)
- **No state validation** (can corrupt graph if ingest fails midway)
- **No transaction semantics** (multi-DB updates not atomic)
- **Hardcoded values** in vector store (768 dimensions, Cosine distance)

---

## 8. CHECKLIST FOR COMPLETION

- [ ] Create metadata-store.ts
- [ ] Wire Postgres storage to ingest route
- [ ] Persist lineage edges to Neo4j during ingest
- [ ] Implement event-driven sync mechanism
- [ ] Extend AST parser for full DDL support
- [ ] Add AI agent skills framework
- [ ] Implement SQL query generation skill
- [ ] Add frontend context visualization tabs
- [ ] Add business data entry UI
- [ ] Fix vector search to return rich context (columns + lineage)
- [ ] Add end-to-end tests
- [ ] Performance test with 1000+ table catalog

---

## Key Gaps Summary

| Layer | Gap | Impact | Effort |
|-------|-----|--------|--------|
| Compilation | metadata-store missing | Blocks all runtime | 4 hours |
| Ingestion | Event-driven sync missing | Manual-only ingestion | 6 hours |
| Storage | Neo4j not wired | Lineage not persisted | 4 hours |
| AI Runtime | No skills framework | No governed query gen | 16 hours |
| Frontend | No context viz | Can't inspect stored data | 12 hours |
| Frontend | No data entry | Can't test live updates | 8 hours |

**Total Effort to Full Implementation: ~2 weeks (80 hours)**
