# Context Layer

Code: `backend/src/storage/*.ts`, `backend/src/rbac/redact.ts`, `backend/src/mcp/server.ts`,
`backend/src/mcp/tools/*.ts`

## What it is

The context layer is the read boundary between "everything the ingestion pipeline knows"
and "what a consumer is allowed to see." It's three storage clients plus one centralized
redaction module plus six tools that compose them - exposed both over the Model Context
Protocol (for external clients like Claude Desktop or Cursor) and internally, to this
project's own agent runtime.

## The three storage clients

### `storage/catalog-store.ts` — `CatalogStore` (catalog-db / Postgres)

Static class, one method per catalog-db operation. The two reads every tool in this doc
ultimately calls: `getTableByName(tableName)` and `getTableColumns(tableId)` — both return
raw rows (`column_name`, `is_pii`, `pii_reason`, snake_case, straight from Postgres). Also:
`getAllTables()` (table + summary listing, no column detail — backs `list_catalog_tables`),
`getStoredSchema()` (the full active catalog keyed by table name, used by the sync diff),
and the soft-delete pair `deactivateTable`/`deactivateColumn` the sync engine uses when a
table or column disappears from the live database.

### `storage/lineage-store.ts` — `LineageStore` (Neo4j)

```ts
static async getDownstream(tableName: string): Promise<string[]> {
  const res = await session.run(`
    MATCH (downstream:Table)-[:DEPENDS_ON*]->(target:Table {name: $tableName})
    RETURN DISTINCT downstream.name AS name
  `, { tableName });
  return res.records.map(r => r.get('name'));
}
```

The edge direction is `target DEPENDS_ON source` (target *uses* source — e.g.
`stg_users DEPENDS_ON raw_users`). `getDownstream(table)` walks the graph backwards
(`*` = any number of hops) to find everything that *depends on* the given table — i.e.
everything that breaks if you change it. `getUpstream(table)` walks forward to find what
the table itself depends on. Both are used together by `get_table_lineage`;
`getDownstream` alone is what `check_downstream_impact` calls.

### `storage/vector-store.ts` — `ProductionVectorStore` (Qdrant)

Pointer pattern, not a document store: each point holds `{tableName, tableId,
business_description}` — `tableId` is the join key back into catalog-db for columns and
PII data, which is always hydrated live rather than duplicated into Qdrant's payload. This
means a table's PII verdicts can never drift out of sync with what's indexed for search,
because search results never carry their own copy.

```ts
async searchSemantic(queryText: string, topK = 3): Promise<SearchResult[]> {
  const queryVector = await this.getEmbedding(queryText);
  const response = await qdrant.query(COLLECTION_NAME, { query: queryVector, limit: topK, with_payload: true });
  return response.points.map(hit => ({ tableName: ..., tableId: ..., business_description: ..., similarity_score: ... }));
}
```

`getEmbedding()` doesn't call an embedding API directly — it delegates to
`getLlmProvider().embed(text)` (see [Agent Runtime](./03-agent-runtime.md#the-llm-provider-abstraction)),
so the embedding backend follows the same `LLM_PROVIDER` switch as everything else. Both
providers are held to the same fixed dimensionality (`EMBEDDING_DIMENSIONS = 768` in
`llm/constants.ts`) so the Qdrant collection stays interoperable regardless of which
provider indexed a given point.

## The single RBAC choke point: `rbac/redact.ts`

Every column-returning tool and route used to duplicate its own PII-masking branch. That's
now one module:

```ts
export function redactColumns<T extends RedactableColumn>(columns: T[], role: unknown): T[] {
  if (isAdmin(role)) return columns;
  const callerRole = normalizeRole(role);
  return columns.map(col => {
    if (!col.is_pii) return col;
    return {
      ...col,
      name: `[REDACTED_PII_${col.name.toUpperCase()}]`,
      description: `ACCESS DENIED: Column masked due to ${callerRole} role policies.`,
    };
  });
}
```

`normalizeRole(role)` is `String(role).toUpperCase() === 'ADMIN' ? 'ADMIN' : 'ANALYST'` —
anything that isn't literally `"ADMIN"` (case-insensitive) is treated as `ANALYST`. There
is no third role and no partial-access tier: this is a binary gate by design, matching
architecture.md's "ADMIN/ANALYST" split.

**The role this function receives is the only thing that matters for security**, and the
critical property is *where that role comes from*. Inside the MCP tools themselves (see
below), `args.userRole` is just a field on the tool's input — trusted only because callers
outside this codebase are expected to supply it honestly (true for the external MCP
server's direct callers). Inside the in-house agent runtime, that trust boundary is
tightened further: `agent/tool-registry.ts`'s `executeTool()` **always overwrites**
`args.userRole` with the authenticated caller's real role before invoking any tool,
regardless of what the model asked for — see
[Agent Runtime → RBAC enforcement](./03-agent-runtime.md#rbac-is-enforced-at-the-tool-boundary-not-the-prompt)
for why that distinction matters.

## The six MCP tools (`mcp/tools/*.ts`)

Every tool is a plain object — `{name, description, inputSchema, execute}` — with no
framework dependency of its own. That shape is what lets the *same* tool implementations be
registered in two different places: `mcp/server.ts` (stdio MCP server, for external
consumers) and `agent/tool-registry.ts` (in-house agent runtime). One source of truth, two
callers.

| Tool | Backing store(s) | What it returns |
|---|---|---|
| `get_table_lineage` | Neo4j | Upstream + downstream table names for one table, both directions in one call. |
| `get_governed_schema` | Postgres (catalog-db) | Business description + RBAC-redacted column list for one table, plus a `schema` field (the live business-db schema, e.g. `target_db` — needed so any SQL written against it is correctly qualified). |
| `search_business_glossary` | Qdrant + Postgres + Neo4j | Semantic search hits, each hydrated with columns (redacted) and lineage in the same response — so one tool call gives the model everything it needs about a matched table, not just a pointer. |
| `check_downstream_impact` | Neo4j | `downstream_impacted_count`, `downstream_impacted_tables`, `safe_to_modify` boolean, and the `schema` field — the tool the write-sql-query skill mandates calling before any DDL. |
| `list_catalog_tables` | Postgres (catalog-db) | All active table names + descriptions, capped at 50 with a truncation note — for discovery when the caller doesn't know the exact table name. No column/PII detail, so it's safe with no RBAC branch at all. |
| `execute_business_query` | `PostgresConnector.applyAndLog()` | Executes SQL directly. ADMIN-only, requires `confirm: true`. See [Agent Runtime](./03-agent-runtime.md#execute_business_query-the-one-write-tool) — this is the one tool in the set that mutates state instead of just reading it. |

### Example: `get_governed_schema`

```ts
execute: async (args) => {
  const table = await CatalogStore.getTableByName(args.tableName);
  if (!table) return { content: [{ type: 'text', text: JSON.stringify({ error: `Table '${args.tableName}' not found.` }) }] };
  const columns = await CatalogStore.getTableColumns(table.id);
  const column_metadata = redactColumns(mapStoredColumns(columns), args.userRole);
  return { content: [{ type: 'text', text: JSON.stringify({
    tableName: table.table_name, schema: config.businessDb.schema, business_description: table.business_summary, column_metadata,
  }) }] };
}
```

`mapStoredColumns()` (also in `rbac/redact.ts`) just reshapes catalog-db's snake_case rows
(`column_name`, `pii_reason`, `is_pii`) into the `{name, description, is_pii}` shape
`redactColumns` expects — a small adapter kept next to the redaction function itself so the
two always evolve together.

## Two ways to reach the same tools

```
mcp/server.ts (stdio, MCP protocol)          agent/tool-registry.ts (in-process)
      │                                              │
      ▼                                              ▼
tools = [getLineageTool, ...6 tools]        AGENT_TOOLS = [getLineageTool, ...6 tools]
      │                                              │
      ▼                                              ▼
CallToolRequestSchema handler:              executeTool(name, rawArgs, {role, useHyde}):
  tool.execute(request.params.arguments)      execArgs = {...rawArgs, userRole: role}  ← always overwritten
                                               tool.execute(execArgs)
```

The external MCP server trusts whatever `userRole` a connected client sends — that's the
protocol's own trust model, unchanged by this project. The in-house runtime doesn't: it's a
second, stricter caller of the exact same tool functions, which is why
`execute_business_query`'s ADMIN gate and `confirm` requirement matter regardless of which
door a caller comes through, and why the runtime adds an *additional*, code-level
"`check_downstream_impact` must have run first" gate on top of what the tool itself checks
— see the agent runtime doc for the full layered picture.
