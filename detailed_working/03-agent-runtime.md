# Agent Runtime

Code: `backend/src/agent/runtime.ts`, `backend/src/agent/tool-registry.ts`,
`backend/src/agent/session-store.ts`, `backend/src/agent/skills/*.ts`,
`backend/src/agent/hyde.ts`, `backend/src/llm/*.ts`

## What it is

An in-house while-loop agent: given a query and a role, it gives an LLM access to every
context-layer tool, executes whatever the model calls, feeds results back, and repeats
until the model produces a final answer. Entry points: `POST /api/ask`
(`server/routes/ask.ts`) and `npm run cli ask "<query>" [--role=ADMIN|ANALYST]`
(`cli/index.ts`). Both call the same `runAgent()`.

## The LLM provider abstraction

Code: `llm/types.ts`, `llm/gemini-provider.ts`, `llm/openrouter-provider.ts`, `llm/index.ts`

Every text-generation and embedding call in this project — the Scribe Agent, HyDE, the
agent loop, vector-store embeddings — goes through one factory:

```ts
// llm/index.ts
export function getLlmProvider(): ActiveProvider {
  if (cached && cachedFor === config.llmProvider) return cached;
  cached = config.llmProvider === 'openrouter' ? new OpenRouterProvider() : new GeminiProvider();
  cachedFor = config.llmProvider;
  return cached;
}
```

`config.llmProvider` reads `LLM_PROVIDER` from the environment (`gemini` by default). Both
providers implement the same three-method interface:

```ts
interface LlmProvider {
  chat(options: LlmChatOptions): Promise<LlmChatResult>;       // tool-calling conversation turn
  generateJson(options: LlmJsonOptions): Promise<string | null>; // structured output (Scribe Agent)
}
interface EmbeddingProvider {
  embed(text: string): Promise<number[] | null>;               // vector-store embeddings
}
```

`LlmMessage`/`LlmToolCall`/`LlmToolDeclaration` are all plain, provider-neutral shapes —
tool parameters are ordinary JSON Schema (the same lowercase-typed shape every MCP tool's
`inputSchema` already uses). `OpenRouterProvider` passes that straight through, since it's
already OpenAI-compatible. `GeminiProvider` is the one that has to translate: it converts
JSON Schema's lowercase `type` strings into Gemini's `Type` enum
(`toGeminiSchema()`/`toGeminiType()`), and converts the shared `LlmMessage[]` into Gemini's
`Content[]` (`toGeminiContents()`), merging consecutive `role: 'tool'` messages into a
single `role: 'user'` `Content` with multiple `functionResponse` parts — Gemini expects
exactly one such batch per assistant tool-calling turn, not one `Content` per tool result.

Because the tool-calling loop in `runtime.ts` only ever speaks in terms of this shared
`LlmMessage[]`/`LlmToolCall[]` shape, `runtime.ts` itself has zero provider-specific code —
swapping `LLM_PROVIDER` doesn't change the loop at all, only which class `getLlmProvider()`
constructs.

### A real bug this abstraction surfaced: `thoughtSignature`

Newer Gemini models attach an opaque `thoughtSignature` to function-call parts that **must**
be replayed verbatim when that turn is fed back as history, or the next request 400s
("missing a thought_signature"). Rebuilding a function-call part from scratch (as the
provider-neutral `LlmToolCall` naturally does) silently drops it. The fix is a
provider-only side channel on the shared type:

```ts
// llm/types.ts
export interface LlmToolCall {
  id: string; name: string; args: Record<string, unknown>;
  providerData?: unknown; // opaque; only GeminiProvider populates/reads this
}
```

`GeminiProvider.chat()` walks the raw response `parts` (not the flattened
`response.functionCalls` convenience getter) so it can capture each part's sibling
`thoughtSignature` field and stash it in `providerData`; `toGeminiContents()` reads it back
when reconstructing that assistant turn for the next request. `OpenRouterProvider` never
touches this field. This matters specifically because of session persistence (below) —
without it, turn 2 of any multi-tool-call Gemini conversation would fail.

## The loop (`agent/runtime.ts`)

```ts
const messages: LlmMessage[] = [...(options.history || []), { role: 'user', content: query }];

for (let iteration = 1; iteration <= maxIterations; iteration++) {
  const response = await provider.chat({ system: systemInstruction, messages, tools });

  if (response.toolCalls.length === 0) {
    // ...finish-reason checks, skill nudge (below), then return the final answer
  }

  messages.push({ role: 'assistant', content: response.text, toolCalls: response.toolCalls });
  for (const call of response.toolCalls) {
    const trace = await executeTool(call.name, call.args, { role, useHyde: options.useHyde });
    toolCalls.push(trace);
    messages.push({ role: 'tool', toolCallId: call.id, name: call.name, content: JSON.stringify(...) });
  }
}
```

`MAX_ITERATIONS = 6` bounds runaway loops; a `finishReason` of `max_tokens`/`safety`
returns immediately with a diagnostic instead of silently burning the remaining iterations
on a truncated turn. Tool results are passed through `chunkForModel()` before going back
into context — arrays longer than `MAX_LIST_ITEMS_FOR_MODEL` (15) get truncated with a
`truncated_note`, so a 40-column table or a 30-table downstream-impact list doesn't blow up
the context window; the caller and the `toolCalls` trace still get the untruncated result.

## RBAC is enforced at the tool boundary, not the prompt

`agent/tool-registry.ts`. The system instruction tells the model its role is fixed and
non-negotiable, but that's not what actually enforces it — a prompt is not a security
boundary. Two mechanisms are:

**1. `userRole` is stripped from what the model can even see:**

```ts
const CALLER_CONTROLLED_PARAMS = new Set(['userRole']);
function toPlainParameters(inputSchema) {
  // ...drop any property (and required entry) named in CALLER_CONTROLLED_PARAMS
}
```

Every tool's `inputSchema` declares `userRole` — the underlying tool functions are shared
with the external MCP server (`mcp/server.ts`), which *does* trust a caller-supplied role.
But `buildToolDeclarations()` deletes it before the schema ever reaches the model, so the
in-house agent has no vocabulary to request a role at all.

**2. `executeTool()` overwrites it unconditionally anyway:**

```ts
export async function executeTool(name, rawArgs, ctx: ToolExecutionContext) {
  const role = normalizeRole(ctx.role);         // the real, authenticated caller role
  const execArgs = { ...rawArgs, userRole: role }; // always wins, even if rawArgs had one
  ...
  const output = await tool.execute(execArgs);
}
```

`ctx.role` comes from `runAgent()`'s own `role` parameter, which traces back to
`server/routes/ask.ts` reading `req.body.userRole` — never from anything the model
generated. So even if a future tool re-added `userRole` to its schema, or a model somehow
smuggled one through a different field, `executeTool()` throws it away before the tool ever
sees it. This was verified directly: a simulated model call passing
`{tableName: 'raw_users', userRole: 'ADMIN'}` while the real session role is `ANALYST`
still executes as `ANALYST` and returns fully redacted columns — the trace records
`userRole: 'ANALYST'`, never the smuggled value.

## `execute_business_query`: the one write tool

The only tool that mutates state instead of reading it, and the only one gated in three
independent layers:

1. **Inside the tool itself** (`mcp/tools/execute-business-query.ts`): `isAdmin(args.userRole)`
   must be true, and `args.confirm` must be `=== true` — both checked before
   `businessConnector.applyAndLog()` is ever called.
2. **Inside the runtime loop** (`agent/runtime.ts`): even an ADMIN caller is blocked with a
   synthetic error result unless `check_downstream_impact` has already been called at least
   once *in this conversation* — checked against the full session history, not just the
   current turn (see [Sessions](#sessions-multi-turn-conversations) for why that
   distinction matters). This is coarse (not tied to which specific table is being
   modified) but cheap, and it closes the "just drop it, no impact check" path outright,
   independent of whether the model follows the system instruction.
3. **In the system instruction / write-sql-query skill** (soft, but still real): never call
   `execute_business_query` in the same turn a statement is first proposed; only after the
   user confirms *that exact statement* in a separate message.

None of these three checks are contingent on any of the others — an ADMIN with
`confirm: true` and a prior impact check will still be denied by layer 1 if the role were
somehow wrong, and a caller who skips the conversation-turn discipline in layer 3 is still
stopped cold by layer 2.

## Skills (`agent/skills/`)

A skill is `{id, name, matches(query), directive}` — matched against the raw query before
the loop starts; a match's `directive` text gets appended to the system instruction for
that call. One skill exists, `write-sql-query.ts`:

```ts
const SQL_INTENT_RE = /\b(write|generate|draft|create|build|construct|update|fix)\b[\s\S]{0,40}\b(sql|query|queries|statement)\b|.../i;
```

Its directive is a numbered procedure: identify every referenced table → call
`check_downstream_impact` for each (mandatory, even for a `SELECT`) → call
`get_governed_schema` for RBAC-safe column names → only then emit SQL, schema-qualified,
in a fenced ` ```sql ` block → summarize impact → if ADMIN, offer to run it and wait for
explicit confirmation before calling `execute_business_query`.

The directive alone isn't trusted to hold — `runtime.ts` backstops step 2 with a one-shot
nudge: if the skill is active, the response looks like it contains SQL (` ```sql ` regex),
and `check_downstream_impact` was never called, the loop pushes a corrective message
("you have not called check_downstream_impact yet...") and continues instead of returning.
Capped at one nudge per conversation so a model that ignores the nudge twice doesn't loop
forever.

## HyDE (`agent/hyde.ts`)

Bounded, best-effort query expansion for `search_business_glossary`. Rather than embedding
the user's terse question directly, `generateHydeDocument(query)` asks the LLM to draft a
short hypothetical *business-glossary description* that would plausibly answer it, and that
prose gets embedded instead — since the vectors already in Qdrant are themselves hydrated
descriptions, a hypothetical description tends to land closer to them in embedding space
than a raw question does. `maxOutputTokens: 120`, and any failure (or empty output) falls
back to the raw query silently — this is wired in `tool-registry.ts`'s `executeTool()` as
an internal-only `__embedText` override, never exposed in the tool's declared schema, so a
model can't set it itself:

```ts
if (ctx.useHyde && name === 'search_business_glossary' && typeof execArgs.query === 'string') {
  const hydeDoc = await generateHydeDocument(execArgs.query);
  if (hydeDoc) execArgs.__embedText = hydeDoc;
}
```

`search_business_glossary`'s own `execute()` checks for `args.__embedText` and embeds that
instead of `args.query` if present — the tool works identically for external MCP consumers
who never set it.

## Sessions: multi-turn conversations (`agent/session-store.ts`)

`POST /api/ask` accepts an optional `sessionId`; the server issues one
(`crypto.randomUUID()`) if absent and returns it in the response so the frontend can echo
it on the next message. Each session record is `{messages, role, provider, createdAt,
updatedAt}`, held in an in-memory `Map` — no persistence across a server restart, which is
an intentional simplicity trade-off for a project this size.

Two rules govern when history is replayed versus discarded, both closing gaps a naive
implementation would leave open:

```ts
export function loadSession(sessionId, role, provider): LoadedSession {
  const existing = sessions.get(sessionId);
  if (existing) {
    if (existing.role === role && existing.provider === provider) {
      return { sessionId, history: existing.messages, wasReset: false };
    }
    return { sessionId, history: [], wasReset: true }; // role or provider changed
  }
  ...
}
```

- **Role change resets history.** If an ADMIN turn surfaced real PII column names into the
  conversation and the caller then switches to ANALYST, replaying that history would hand
  the model (and thus the user) that unredacted content again regardless of what the
  *current* tool call redacts — the leak is in the context, not the tool output. Resetting
  the whole history on a role change closes this; the response's `wasReset: true` lets the
  frontend show "starting a fresh conversation."
- **Provider change resets history.** `providerData` (the `thoughtSignature` side channel
  above) and tool-call `id` semantics are provider-specific and not portable — replaying
  Gemini-shaped history into OpenRouter (or vice versa) would be malformed.

`saveSession()` also trims history to the last `MAX_HISTORY_TURNS` (12) **user-message
boundaries**, never mid-tool-call-sequence — a `role: 'user'` message is always a safe cut
point because tool results (`role: 'tool'`) always follow the assistant turn that requested
them, never a bare user turn.

The `calledDownstreamCheck` flag in `runtime.ts` is seeded from this replayed history, not
just reset to `false` per call — otherwise a fresh `runAgent()` invocation on turn 2 of a
session would forget turn 1 ever called `check_downstream_impact`, and either re-nudge the
skill or re-block `execute_business_query` on every single turn.
