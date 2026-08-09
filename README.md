# 🚀 MetaGraph-MCP

> **Autonomous Governance & Active Metadata Context Engine for Enterprise AI Agents**

MetaGraph-MCP is an **event-driven metadata ingestion and lineage engine** that builds real-time SQL dependency graphs, detects PII using autonomous LLM agents, and exposes governed enterprise context to AI agents through the **Model Context Protocol (MCP)**.

---

## ✨ Key Capabilities

* 🧩 **SQL Metadata Ingestion** — Ingest SQL logs, DDL files, and transformation queries.
* 🌐 **Real-Time Data Lineage** — Build directed dependency graphs (DAGs) between data assets.
* 🤖 **Autonomous PII Detection** — Identify potentially sensitive fields using LLM-powered classification.
* 🔐 **Governed Context** — Apply role-based access control and dynamic PII masking.
* 🔌 **MCP Integration** — Expose governed metadata and lineage through MCP tools.
* ⚡ **Event-Driven Architecture** — Continuously update metadata as new SQL activity arrives.

---

## 🏗️ System Architecture

```text
┌───────────────────────────────┐
│      Raw SQL Logs / DDL       │
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│       AST Parser Engine       │
│   SQL Parsing & Extraction    │
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│    Directed Lineage Graph     │
│             (DAG)             │
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│     Scribe Metadata Agent     │
│  Metadata Enrichment & PII    │
│        Classification         │
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│   Governed MCP Protocol       │
│           Server              │
└───────────────┬───────────────┘
                │
        ┌───────┴────────┐
        ▼                ▼
┌───────────────┐  ┌───────────────────┐
│ Claude /      │  │ Custom Agent      │
│ Cursor        │  │ Harness           │
└───────────────┘  └───────────────────┘
```

### 🔄 Data Flow

```text
SQL / DDL
   │
   ▼
AST Parsing
   │
   ▼
Lineage DAG
   │
   ▼
Metadata + PII Classification
   │
   ▼
RBAC + Dynamic Masking
   │
   ▼
MCP Tools
   │
   ├──► Claude Desktop
   ├──► Cursor
   └──► Custom AI Agents
```

---

## 🛠️ MCP Tools

MetaGraph-MCP exposes governed metadata through the following MCP tools:

| Tool                  | Parameters              | Description                                                         |
| --------------------- | ----------------------- | ------------------------------------------------------------------- |
| `get_table_lineage`   | `tableName`             | Returns the upstream dependency graph (DAG) for a data asset.       |
| `get_governed_schema` | `tableName`, `userRole` | Returns table documentation with dynamic PII masking based on RBAC. |

---

## ⚡ Quickstart

### Prerequisites

Make sure you have:

* [Node.js](https://nodejs.org/) installed
* npm available in your PATH
* The repository dependencies installed

```bash
npm install
```

---

### 1. Register Table Schemas

Register the tables and their columns using the CLI:

```bash
node src/cli/index.js schema raw_orders \
  order_id customer_email amount

node src/cli/index.js schema stg_orders \
  order_id user_id amount
```

---

### 2. Ingest SQL / DDL

Ingest SQL transformation queries or DDL files:

```bash
node src/cli/index.js ingest ./sample.sql
```

The ingestion pipeline parses the SQL and updates the lineage graph.

---

### 3. Inspect MCP Tools

Launch the **MCP Inspector** against the MetaGraph server:

```bash
npx @modelcontextprotocol/inspector \
  node src/mcp/server.js
```

This allows you to interactively inspect and invoke the exposed MCP tools.

---

### 4. Start the REST Control Dashboard

Run the local control dashboard:

```bash
npm run server
```

Then open:

```text
http://localhost:3000
```

---

## 🧪 Try It Right Now

Make sure the CLI is executable:

```bash
chmod +x src/cli/index.js
```

Then register a sample table:

```bash
node src/cli/index.js schema raw_orders \
  order_id customer_email amount
```

Start the MCP Inspector:

```bash
npx @modelcontextprotocol/inspector \
  node src/mcp/server.js
```

You can now inspect the available tools and query the metadata graph.

---

## 🔐 Governance & PII Protection

MetaGraph-MCP is designed to provide AI agents with useful enterprise metadata **without unnecessarily exposing sensitive information**.

The governance pipeline can:

1. Discover metadata from SQL and DDL.
2. Construct table and column-level lineage.
3. Classify potentially sensitive or PII fields.
4. Assign confidence scores to classifications.
5. Apply RBAC policies.
6. Dynamically mask protected fields.
7. Expose only the permitted context through MCP.

```text
             ┌──────────────────┐
             │   Table Metadata │
             └────────┬─────────┘
                      │
                      ▼
             ┌──────────────────┐
             │  PII Classifier  │
             └────────┬─────────┘
                      │
                      ▼
             ┌──────────────────┐
             │ Confidence Score │
             └────────┬─────────┘
                      │
                      ▼
             ┌──────────────────┐
             │   RBAC Policy    │
             └────────┬─────────┘
                      │
                      ▼
             ┌──────────────────┐
             │ Dynamic Masking  │
             └────────┬─────────┘
                      │
                      ▼
             ┌──────────────────┐
             │ Governed Context │
             └──────────────────┘
```

---

## 🧠 Example Use Case

Consider a table containing:

```text
raw_orders
├── order_id
├── customer_email   ← PII
└── amount
```

A governed schema request can return different representations depending on the requesting user's role.

```text
Data Engineer
    │
    ▼
customer_email = customer@example.com

Restricted Agent
    │
    ▼
customer_email = ***************
```

This enables AI agents to reason over enterprise metadata while respecting access-control policies.

---

## 📁 Project Structure

```text
MetaGraph-MCP/
├── src/
│   ├── cli/
│   │   └── index.js
│   ├── mcp/
│   │   └── server.js
│   └── ...
├── sample.sql
├── package.json
└── README.md
```

---

## 🎯 Vision

MetaGraph-MCP aims to become a **governance layer for enterprise AI agents** by combining:

> **Metadata + Lineage + PII Intelligence + RBAC + MCP**

Instead of giving AI agents unrestricted access to enterprise data, MetaGraph-MCP provides them with **context that is structured, traceable, and governed**.

---

## 🚀 Roadmap

Potential future capabilities include:

* [ ] Column-level lineage
* [ ] More SQL dialects
* [ ] Persistent metadata storage
* [ ] Incremental/event-based ingestion
* [ ] Advanced PII entity detection
* [ ] Policy-as-code governance
* [ ] Fine-grained MCP authorization
* [ ] Lineage visualization
* [ ] Metadata search
* [ ] Audit logging
* [ ] Multi-agent governance policies

---

## 📄 License

Add your project license here.

---

**MetaGraph-MCP** — *Making enterprise metadata accessible to AI agents, without giving up governance.*
