# Frontend Workspace

Code: `frontend/src/App.tsx`, `frontend/src/metagraph/useMetagraphWorkspace.ts`,
`frontend/src/metagraph/sections/*.tsx`, `frontend/src/metagraph/components/*.tsx`

## Shape

One hook, `useMetagraphWorkspace()`, owns every piece of state and every backend call; `App.tsx`
just reads three tabs off it (`activeTab: 'business-db' | 'context-layer' | 'ask'`) and renders
the matching section. Nothing else in the tree talks to `fetch` directly — `metagraph/api.ts`'s
`request(path, options)` is the one call site, so every backend interaction is traceable to
`useMetagraphWorkspace.ts`.

## Update Business DB (`BusinessDbSection.tsx`)

A SQL textarea (`sqlInput`), a client-side PII pre-scan (`getRiskHits()` in `utils.ts` — a
regex over column-definition lines against `PII_KEYWORDS`, purely advisory, not a security
control), and two actions: **Apply SQL** (`POST /api/exec`, applies the statement to
`business-db` and logs it — this is what fires the ingestion pipeline's DDL/query_logs
triggers) and **Sync now** (`POST /api/sync`, forces `SyncEngine.syncUp()` immediately
instead of waiting for the event-driven listener). The "Live on business-db" table list at
the bottom polls `/api/retrieve-business-db` every 3 seconds while this tab (or Context
Layer) is active, so applying SQL here and watching it propagate through to the catalog
without touching Update Business DB again is the point of the demo.

## Context Layer (`ContextLayerSection.tsx`)

Four stat cards (tables documented, PII columns, lineage edges, sync watermark — all
derived straight from `/api/retrieve-catalog-db` and `/api/lineage`), a lineage graph, and
an asset detail panel.

**`LineageGraph.tsx`** lays out nodes with `dagre` (`rankdir: 'LR'`) and renders them via
`@xyflow/react`. `AssetNode.tsx` is a custom node type showing up to `VISIBLE_COLUMNS` (5)
columns with a "show more" toggle, PII badges per column, and a dashed violet border for
tables that exist in the lineage graph (from a logged query) but haven't been documented
yet by Track A. Selecting a node calls `onSelectAsset(tableName)`, which feeds
`AssetDetailPanel.tsx` — business description, full column list, and (added when this panel
was completed) the selected table's upstream sources / downstream dependents as pill lists,
computed in the hook:

```ts
const upstreamOfSelected = useMemo(
  () => (selectedAssetName ? graphData.edges.filter(e => e.to === selectedAssetName).map(e => e.from) : []),
  [graphData, selectedAssetName],
);
```

**Known limitation:** in manual browser testing, `ReactFlow`'s node wrapper elements were
observed with an inline `visibility: hidden` style despite rendering visibly on screen,
which blocks programmatic (automation-driven) click-to-select on the graph — a human
clicking with a real mouse is unaffected, since this only surfaced when dispatching
synthetic click events. The likely cause: `ContextLayerSection`'s 3-second poll
(`loadContextLayer` in the hook) produces a brand-new `catalogDbTables`/`lineageData`
object identity on every tick even when the underlying data hasn't changed, which cascades
through `buildGraphData()` → `LineageGraph`'s node/edge `useMemo` → a full ReactFlow
re-layout every 3 seconds. This wasn't introduced by any change described in this doc set
and wasn't chased further; a fix would most likely involve memoizing `buildGraphData()`'s
output against a content hash (or comparing fetched JSON before calling `setState`) so
polling with unchanged data doesn't force React Flow to reprocess the whole graph.

## Ask a Question (`AskSection.tsx`)

A chat transcript, not a single-shot search box. State lives in the hook:
`chatMessages` (array of `{id, role: 'user'|'assistant'|'system', content, matchedTables?,
toolCalls?, skillsLoaded?}`) and `sessionId` (`null` until the first response assigns one).

```ts
const handleSendMessage = useCallback(async (event, query = ragQuery) => {
  // push a user message + a pending assistant placeholder immediately
  const data = await request('/api/ask', { method: 'POST', body: JSON.stringify({ query, userRole, sessionId }) });
  setSessionId(data.sessionId);
  // replace the pending placeholder with the real answer; if data.wasReset, insert
  // a system divider ("Role changed - starting a fresh conversation...") first
}, [ragQuery, sessionId, userRole]);
```

`handleNewChat()` just clears `chatMessages` and `sessionId` back to their initial state —
the next message is sent with no `sessionId`, so the backend issues a fresh one. Answers are
rendered through `renderAnswer()`, which splits on fenced ` ```lang ` code blocks first
(so SQL the write-sql-query skill emits renders as a real `<pre><code>` block, not literal
backtick text) and then does light Markdown-ish line rendering (`###`/`##` headers, `* `
bullets, `---` rules) on everything else — line-by-line, not a full Markdown parser, kept
intentionally minimal since the agent's output is fairly structured already.

The Admin/Analyst toggle (`userRole`) is intentionally *not* wired to reset the chat
client-side — the backend's session-store role check (see the agent runtime doc) is what
actually resets history on a role change, and the response's `wasReset` flag is what
surfaces that to the transcript, so the visible conversation log stays intact for the user
to scroll back through even after a reset.

## Purge (`AppHeader.tsx`)

The header's "Purge catalog" button calls `handlePurge()` in the hook, which confirms via
`window.confirm(...)` and then `POST /api/purge` — wipes catalog-db, Neo4j, and Qdrant in
one call (`Promise.all` across the three stores' own `purge()` methods), for resetting a
demo to empty without restarting the containers.
