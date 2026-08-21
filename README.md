# MetaGraph

**An active metadata & lineage engine.** MetaGraph watches a live company database, keeps a
governed catalog of its tables, columns, PII classifications, business definitions, and
lineage graph continuously in sync with it, and exposes that catalog both as MCP tools for
external AI clients (Claude Desktop, Cursor, etc.) and through an in-house tool-calling
agent with role-based access control.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

## Why

Data catalogs go stale the moment someone ships a migration. MetaGraph's answer is to stop
treating documentation as something a human writes once: an ingestion engine diffs the live
schema on every change, an LLM (Scribe Agent) drafts business definitions and PII
classifications only for what actually changed, and a lineage graph is derived from real
query logs via SQL AST parsing — not hand-maintained diagrams. On top of that catalog sits a
deterministic RBAC layer and an agent that can answer "what does this column mean," "what
breaks if I drop this table," or "write me a query for X" — grounded in that catalog, never
guessing.

## Architecture

```
┌───────────────────────────┐      ┌───────────────────────────┐
│ Live Database (Postgres)  │      │   SQL Query Logs           │
│ (information_schema)      │      │   (DDL / executed queries) │
└─────────────┬─────────────┘      └─────────────┬─────────────┘
              │ Track A: schema diff              │ Track B: AST lineage extraction
              ▼                                    ▼
┌──────────────────────────────────────────────────────────────┐
│                  DUAL-TRACK INGESTION ENGINE                 │
│         (event-driven: Postgres LISTEN/NOTIFY, debounced)    │
└─────────────────────────────┬────────────────────────────────┘
                               ▼
┌──────────────────────────────────────────────────────────────┐
│               SCRIBE AGENT (AI Documentation)                │
│    Delta PII tagging & LLM business-definition generation    │
└─────────────────────────────┬────────────────────────────────┘
                               │
╔══════════════════════════════╧═══════════════════════════════╗
║                        CONTEXT LAYER                          ║
║  Postgres (catalog state)  Neo4j (lineage DAG)  Qdrant (RAG)  ║
║                             │                                 ║
║               Deterministic RBAC & PII masking                ║
║                             │                                 ║
║         MCP Server: get_table_lineage, get_governed_schema,   ║
║    search_business_glossary, check_downstream_impact,         ║
║         list_catalog_tables, execute_business_query           ║
╚══════════════════════════════╤═══════════════════════════════╝
                                │
              ┌─────────────────┴─────────────────┐
              ▼                                    ▼
   External AI consumers                In-house agent runtime
 (Claude Desktop, Cursor,               (RBAC-gated tool-calling
      custom agents)                 loop + chat UI, /api/ask)
```

Full original design: [`architecture.md`](./architecture.md). Implementation-level
walkthroughs of every piece above, with real code: [`detailed_working/`](./detailed_working/).

## Features

- **Dual-track ingestion** — schema sync from `information_schema` (Track A) plus AST-based
  lineage extraction from query logs (Track B), triggered automatically via Postgres
  `LISTEN`/`NOTIFY` whenever the live database changes.
- **Scribe Agent** — LLM-generated business descriptions and per-column PII verdicts, run
  only on new/changed tables and columns; existing PII verdicts are never silently
  overwritten.
- **Polyglot context layer** — Postgres (catalog state), Neo4j (lineage DAG), Qdrant
  (semantic search over business definitions), joined live rather than duplicated.
- **Deterministic RBAC** — one shared redaction module enforces ADMIN/ANALYST column
  masking everywhere; the in-house agent additionally strips role from what the model can
  even request and overwrites it server-side on every tool call.
- **Six MCP tools**, usable by any MCP client or by the in-house agent: lineage, governed
  schema, semantic search, downstream-impact analysis, table discovery, and — ADMIN-only,
  multi-layer-gated — direct SQL execution.
- **Provider-agnostic agent runtime** — Gemini or OpenRouter, switchable via one env var,
  behind a shared tool-calling loop with skills (a "write SQL query" skill that mandates an
  impact check before any DDL), HyDE query expansion, and multi-turn chat sessions.
- **Frontend workspace** — apply SQL to the live database, watch the context layer catch up
  live, inspect the lineage graph, and chat with the agent, all in one UI.

## Tech stack

| | |
|---|---|
| Backend | TypeScript, Express 5, `@modelcontextprotocol/sdk` |
| Storage | Postgres ×2 (business + catalog), Neo4j, Qdrant |
| LLM | Gemini or OpenRouter (`@google/genai`, provider-agnostic abstraction) |
| Frontend | React 19, Vite, Tailwind 4, `@xyflow/react` + `dagre` for the lineage graph |
| Runtime | Bun-compatible, run via `tsx` |

## Quick start

Requires Docker, Node/Bun, and a Gemini API key (or an OpenRouter key — see
[LLM provider setup](#llm-provider-setup)).

```bash
git clone git@github.com:midsane/MetaGraph-MCP.git
cd MetaGraph-MCP/backend
cp .env.example .env        # fill in GEMINI_API_KEY at minimum
npm install
docker compose up -d        # business-db, catalog-db, neo4j, qdrant, adminer

npm run cli sync            # one-shot ingest of the seeded demo schema
npm run server               # REST API on :3000
npm run sync:watch           # separate terminal: event-driven sync daemon
```

```bash
cd MetaGraph-MCP/frontend
npm install
npm run dev                  # UI on :5173
```

Or use `./startup.sh` from the repo root to do all of the above in one shot — it wipes and
recreates every container volume for a clean demo, then backgrounds the server, the sync
daemon, and the frontend (logs in `.demo-logs/`).

Talk to the agent without the UI:

```bash
npm run cli ask "Which table stores customer emails?" --role=ANALYST
```

Run as an MCP server for Claude Desktop / Cursor / any MCP client:

```bash
npm run mcp
```

### LLM provider setup

Set `LLM_PROVIDER=gemini` (default) or `LLM_PROVIDER=openrouter` in `backend/.env`, then
supply the matching key (`GEMINI_API_KEY` or `OPENROUTER_API_KEY`). Embeddings follow the
same switch. Full variable list: [`backend/.env.example`](./backend/.env.example).

## Project structure

```
backend/
  src/
    agent/        in-house agent runtime: loop, tool registry, sessions, skills, HyDE
    llm/           provider-agnostic Gemini/OpenRouter abstraction
    mcp/           MCP server + the six tools it (and the agent) share
    core/          sync engine, AST lineage parser, event-driven LISTEN/NOTIFY listener
    connectors/    read-only client for the live business database
    storage/       catalog (Postgres), lineage (Neo4j), vectors (Qdrant)
    rbac/          the one PII-redaction module everything else calls
    server/        Express app + REST routes
    cli/           `npm run cli <sync|exec|ask>`
frontend/
  src/metagraph/
    sections/      the three tabs: Update Business DB, Context Layer, Ask a Question
    components/    lineage graph, asset panel, shared UI primitives
detailed_working/  implementation deep-dives, one per major feature
```

## License

[MIT](./LICENSE)

## Explanation videos

- Part 1: https://www.loom.com/share/40be560d55b249ee9c8d15680db677eb
- Part 2: https://www.loom.com/share/7cac8fbb58d340d49cf36fbcba50db02