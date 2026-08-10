# 🚀 MetaGraph-MCP

> **Autonomous Governance & Active Metadata Context Engine for Enterprise AI Agents**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-v20%2B-green.svg)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)](https://www.docker.com/)
[![MCP Protocol](https://img.shields.io/badge/MCP-v1.0-purple.svg)](https://modelcontextprotocol.io/)

MetaGraph-MCP is a production-grade, active metadata ingestion and lineage engine built for enterprise AI context delivery. It parses SQL AST query execution logs into directed lineage graphs (DAGs), auto-documents datasets using autonomous LLM agents with PII detection, indexes semantic metadata into a standalone **Qdrant Vector Database**, and exposes governed context to AI agents via the **Model Context Protocol (MCP)**.

---

## 🏗️ System Architecture

The system processes raw SQL and DDL metadata through an AST parser, enriches it with autonomous metadata and PII classification, stores semantic embeddings in Qdrant, and exposes governed context through MCP and REST APIs.

### Cosine Similarity

$$
\operatorname{CosineSimilarity}(A,B)
=
\frac{\mathbf{A}\cdot\mathbf{B}}
{\|\mathbf{A}\|\,\|\mathbf{B}\|}
$$

```text
[ Raw SQL Logs / DDL Files ]
              │
              ▼
      [ AST Parser Engine ]
              │
              ▼
 [ Directed Lineage Graph (DAG) ]
              │
              ▼
     [ Scribe Metadata Agent ]
              │
              ▼
   [ PII Classifier & Confidence ]
              │
              ▼
      [ Qdrant Vector DB ]
        (RAG Embeddings)
              │
       ┌──────┴──────┐
       ▼             ▼
[ Governed MCP ]  [ Express REST API
     Server        & Swagger UI ]
       │             │
       ▼             ▼
[ Claude Desktop / Cursor ]   [ Enterprise AI Agents
                                & Humans ]
```

---

## ✨ Core Features

- **AST-Based Lineage Ingestion:** Parses raw SQL query logs and DDL statements using `node-sql-parser` to construct an in-memory Directed Acyclic Graph (DAG) mapping upstream/downstream dependencies.
- **Autonomous Metadata Agent (Scribe):** Leverages LLMs to generate column descriptions, flag sensitive PII data fields (`is_pii: true`), and output confidence ratings (`0.0 → 1.0`).
- **Vector RAG Engine (Qdrant):** Embeds table definitions and column descriptions using `gemini-embedding-2` and stores them in a Qdrant vector collection for fast natural-language semantic catalog search.
- **Governed MCP Server:** Implements the official `@modelcontextprotocol/sdk` over `stdio` with built-in RBAC rules, including PII redaction for non-`ADMIN` agents.
- **CLI & OpenAPI Tools:** Includes a command-line interface (`atlan-context`) for local SQL batch ingestion and interactive Swagger documentation at `/docs`.

---

## 📁 Directory Structure

```text
atlan-context-mcp/
├── .env.example
├── Dockerfile
├── docker-compose.yml
├── package.json
├── README.md
└── src/
    ├── config/
    │   └── env.js                 # Environment variables & configuration
    ├── core/
    │   ├── ast-parser.js          # SQL AST parsing & dependency extraction
    │   ├── lineage-dag.js         # Directed Graph data structure
    │   ├── metadata-store.js      # Persistent metadata state storage
    │   └── vector-store.js        # Qdrant Vector Store integration
    ├── agents/
    │   └── scribe-agent.js        # Autonomous documentation & PII classifier
    ├── mcp/
    │   ├── server.js              # Model Context Protocol Stdio Server
    │   └── tools/
    │       ├── get-lineage.js
    │       ├── get-governed-schema.js
    │       └── search-metadata.js # Semantic vector search (RAG)
    ├── server/
    │   └── app.js                 # Express REST API & Swagger UI (/docs)
    └── cli/
        └── index.js               # CLI runner (`atlan-context ingest`)
```

---

## ⚡ Getting Started

### 1. Prerequisites

- Node.js >= 20.x
- Docker & Docker Compose
- Google Gemini API Key

### 2. Environment Setup

Create a `.env` file in the root directory:

```env
GEMINI_API_KEY=your_gemini_api_key_here
PORT=3000
QDRANT_URL=http://localhost:6333
DOTENV_CONFIG_QUIET=true
```

### 3. Spin Up Infrastructure

Start the application and the Qdrant vector database container:

```bash
docker-compose up --build -d
```

### 4. Ingest Sample Data via CLI

Register table schema definitions:

```bash
node src/cli/index.js schema raw_orders order_id customer_email amount
node src/cli/index.js schema stg_orders order_id user_id amount
```

Ingest raw SQL transform queries:

```bash
node src/cli/index.js ingest ./sample.sql
```

### 5. Access Dashboards & Developer Documentation

- **Swagger API Documentation:** `http://localhost:3000/docs`
- **REST Dashboard:** `http://localhost:3000`
- **Qdrant Vector Dashboard:** `http://localhost:6333/dashboard`

---

## 🛠️ MCP Protocol Integration

To connect this server to **Claude Desktop** or **Cursor**, add the following configuration to your MCP settings file (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "atlan-context": {
      "command": "node",
      "args": ["/path/to/atlan-context-mcp/src/mcp/server.js"],
      "env": {
        "GEMINI_API_KEY": "your_gemini_api_key_here",
        "QDRANT_URL": "http://localhost:6333"
      }
    }
  }
}
```

### Exposed MCP Tools

| Tool Name | Parameters | Description |
| --- | --- | --- |
| `get_table_lineage` | `tableName` | Returns upstream dependency DAG for a target data asset. |
| `get_governed_schema` | `tableName`, `userRole` | Returns table documentation with role-based PII masking. |
| `search_business_glossary` | `query`, `topK` | Executes semantic vector RAG search over indexed metadata. |

---

## 📜 License

This project is licensed under the MIT License.
