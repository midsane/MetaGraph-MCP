# Detailed Working Docs

Implementation-level deep dives into how each part of MetaGraph actually works, walking
through real code — not a restatement of [`architecture.md`](../architecture.md), which is
the original high-level design. These describe what's on disk today.

1. [Ingestion Pipeline](./01-ingestion-pipeline.md) — the dual-track sync engine, the Scribe
   Agent, AST-based lineage extraction, and the event-driven LISTEN/NOTIFY loop.
2. [Context Layer](./02-context-layer.md) — the three storage clients, the centralized RBAC
   redaction module, and the six MCP tools built on top of them.
3. [Agent Runtime](./03-agent-runtime.md) — the provider-agnostic LLM abstraction (Gemini /
   OpenRouter), the tool-calling loop, skills, HyDE, and multi-turn sessions.
4. [Frontend Workspace](./04-frontend.md) — the three-tab UI, the lineage graph, and the
   chat-based Ask a Question flow.

Read them in order if you're new to the codebase — each one assumes the previous layer.
