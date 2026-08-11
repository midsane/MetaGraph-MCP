# MetaGraph v2: Enterprise Active Metadata & Context Platform

> An RBAC-governed active metadata platform featuring dual-track schema
> ingestion, Neo4j lineage graphs, Qdrant GraphRAG, and an MCP server
> for Agentic Context-as-a-Service.

------------------------------------------------------------------------

## 🏗️ Core Architecture Overview

MetaGraph v2 decouples **Live Database Ground Truth** from **Code-Level
Lineage Extraction**, unifying them through a polyglot persistence layer
and exposing governance primitives to AI agents via the Model Context
Protocol (MCP).

``` text
┌───────────────────────────┐      ┌───────────────────────────┐
│ Live Database (Postgres)  │      │ SQL Migration / dbt Files │
│ (information_schema)      │      │ (Raw DDL / Query Logs)    │
└─────────────┬─────────────┘      └─────────────┬─────────────┘
              │                                  │
     (Ground Truth State)                (AST Lineage Extraction)
              │                                  │
              ▼                                  ▼
┌──────────────────────────────────────────────────────────────┐
│                  DUAL-TRACK INGESTION ENGINE                 │
└─────────────────────────────┬────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│               SCRIBE AGENT (AI Documentation)                │
│    (Delta PII Tagging & LLM Business Definition Generator)   │
└─────────────────────────────┬────────────────────────────────┘
                              │
══════════════════════════════╧════════════════════════════════
╔══════════════════════════════════════════════════════════════╗
║                        CONTEXT LAYER                         ║
║                                                              ║
║  ┌────────────────────────────────────────────────────────┐  ║
║  │                POLYGLOT STORAGE LAYER                  │  ║
║  │ ┌──────────────────┬──────────────────┬──────────────┐ │  ║
║  │ │ Postgres         │ Neo4j            │ Qdrant       │ │  ║
║  │ │ (Catalog State)  │ (Lineage Graph)  │ (Vector RAG) │ │  ║
║  │ │ Tables, Cols, PII│ DAG Nodes/Edges  │ Business Defs│ │  ║
║  │ └──────────────────┴──────────────────┴──────────────┘ │  ║
║  └───────────────────────────┬────────────────────────────┘  ║
║                              │                               ║
║                              ▼                               ║
║  ┌────────────────────────────────────────────────────────┐  ║
║  │             DETERMINISTIC RBAC & MASKING LAYER         │  ║
║  │           (Role-based PII Redaction: ADMIN/ANALYST)    │  ║
║  └───────────────────────────┬────────────────────────────┘  ║
║                              │                               ║
║                              ▼                               ║
║  ┌────────────────────────────────────────────────────────┐  ║
║  │             MCP SERVER (Context-as-a-Service)          │  ║
║  │   Tools: search_catalog, check_downstream_impact, etc. │  ║
║  └───────────────────────────┬────────────────────────────┘  ║
╚══════════════════════════════╪═══════════════════════════════╝
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                    EXTERNAL AI CONSUMERS                     │
│         (Claude Desktop, Cursor IDE, Custom AI Agents)       │
└──────────────────────────────────────────────────────────────┘
```

------------------------------------------------------------------------

## 🔑 Key Architectural Design Decisions

### 1. Dual-Track Ingestion Engine

-   **Ground-Truth Connector:** Queries PostgreSQL
    `information_schema.columns` to establish absolute live state
    without relying on regex or heuristic parsing.
-   **Shift-Left AST Lineage Engine:** Parses raw DDL and migration logs
    (`INSERT INTO ... SELECT`, `CTAS`, `ALTER TABLE`) to build
    bi-directional table- and column-level DAGs.

### 2. Polyglot Persistence & "Pointer Pattern"

-   **Postgres (Relational Ground Truth):** Stores structured schemas,
    column data types, and PII classifications.
-   **Neo4j (Graph Lineage):** Stores bi-directional dependency nodes
    and edges for fast N-hop downstream impact analysis.
-   **Qdrant (Vector Index):** Stores *only* Scribe-Agent generated
    business summaries as vectors. The payload holds only the `table_id`
    (**Pointer Pattern**). Columns are dynamically joined from Postgres
    at runtime, eliminating vector dilution and stale metadata.

### 3. Event-Driven Real-Time Sync & Delta Processing

-   **Postgres `LISTEN/NOTIFY`:** Captures live DDL mutations (`CREATE`,
    `ALTER`, `DROP`) in real time without poll-heavy cron jobs.
-   **High-Water Mark Incremental Sync:** Processes only new query logs
    since `last_synced_at`.
-   **Scribe Agent Diffing:** Triggers LLM classification exclusively on
    newly added or mutated columns, saving compute and token overhead.

### 4. Zero-Trust RBAC & Deterministic PII Masking

-   Applies programmatic policy enforcement prior to context injection
    into LLM prompts or MCP tool payloads.
-   Column metadata marked `is_pii = true` is masked or stripped
    dynamically based on `userRole` (`ANALYST` vs. `ADMIN`),
    guaranteeing zero LLM hallucination of sensitive data.

------------------------------------------------------------------------

## 📊 Polyglot Data Model Strategy

  -----------------------------------------------------------------------
  Storage Component Technology        Primary Content   Design Rationale
  ----------------- ----------------- ----------------- -----------------
  **Catalog Ground  PostgreSQL        Table schemas,    Strict relational
  Truth**                             column types, PII integrity and
                                      tags, sync        fast exact
                                      timestamps        primary-key
                                                        lookups.

  **Lineage DAG**   Neo4j             Table nodes and   Natively
                                      `DEPENDS_ON` /    evaluates
                                      `DERIVED_FROM`    recursive graph
                                      edges             traversals for
                                                        N-hop impact
                                                        analysis.

  **Semantic        Qdrant            Embeddings of     Decouples
  Index**                             business          semantic search
                                      descriptions +    from structured
                                      `table_id`        schema storage.
                                      payload           
  -----------------------------------------------------------------------

------------------------------------------------------------------------

## 🛠️ MCP Server Interface (Context-as-a-Service)

  -------------------------------------------------------------------------------------------
  Tool Name                   Parameters                              Description
  --------------------------- --------------------------------------- -----------------------
  `search_catalog`            `query: string`                         Semantic search over
                                                                      Qdrant business
                                                                      definitions; returns
                                                                      RBAC-filtered table
                                                                      schemas.

  `get_table_schema`          `tableName: string, userRole: string`   Fetches live columns
                                                                      from Postgres with
                                                                      deterministic PII
                                                                      redaction applied.

  `check_downstream_impact`   `tableName: string`                     Traverses Neo4j DAG to
                                                                      return all downstream
                                                                      tables and dashboards
                                                                      at risk of breakage.

  `verify_schema_freshness`   `tableName: string`                     JIT verification check
                                                                      to ensure schema state
                                                                      has not mutated prior
                                                                      to executing
                                                                      migrations.

  `sync_catalog`              `none`                                  Triggers high-water
                                                                      mark incremental sync
                                                                      against query logs and
                                                                      live database metadata.
  -------------------------------------------------------------------------------------------

------------------------------------------------------------------------

## 🧩 Context Layer

> **Context-as-a-Service for AI & Humans**

``` text
┌───────────────────────────────────────────────────────────┐
│                      CONTEXT LAYER                        │
│             ("Context-as-a-Service" for AI & Humans)      │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ 3. Serving & Agentic Layer (MCP Server, APIs)       │  │
│  ├─────────────────────────────────────────────────────┤  │
│  │ 2. Governance & Logic Layer (RBAC, PII Masking)     │  │
│  ├─────────────────────────────────────────────────────┤  │
│  │ 1. Polyglot Storage Backbone                        │  │
│  │    [ Postgres (State) | Neo4j (Graph) | Qdrant (RAG)]│ │
│  └─────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────┘
```

### 2. The Context Layer --- The Unified Abstraction

The Context Layer encompasses the polyglot storage layer plus the
business logic and access control built on top of it:

-   **Aggregation:** Joins Postgres schemas + Neo4j lineage + Qdrant
    business definitions at runtime using the Pointer Pattern
    (`table_id`).
-   **Active Governance:** Dynamically applies RBAC and PII masking
    (`ANALYST` vs. `ADMIN`) before handing data out.
-   **Delivery:** Exposes the metadata via MCP tools (`search_catalog`,
    `check_downstream_impact`, `get_table_schema`) so AI agents such as
    Cursor and Claude can act on it.

------------------------------------------------------------------------
 **"The polyglot storage layer (Postgres + Neo4j + Qdrant) is the
 persistence backbone of my architecture. But the Context Layer is what
 sits on top: it turns raw, multi-database metadata into
 'Context-as-a-Service'. It dynamically executes RBAC PII redaction,
 joins live schemas with graph lineage, and exposes clean, governed
 context to external AI agents via the Model Context Protocol."**
