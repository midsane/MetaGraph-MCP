import { Type, type FunctionDeclaration } from '@google/genai';
import { getLineageTool } from '../mcp/tools/get-lineage.js';
import { getGovernedSchemaTool } from '../mcp/tools/get-governed-schema.js';
import { vectorSearchTool } from '../mcp/tools/search-metadata.js';
import { checkDownstreamImpactTool } from '../mcp/tools/check-downstream-impact.js';
import { listCatalogTablesTool } from '../mcp/tools/list-catalog-tables.js';
import { normalizeRole, type Role } from '../rbac/redact.js';
import { generateHydeDocument } from './hyde.js';

// Same tool implementations the MCP server exposes to external consumers
// (Claude Desktop, Cursor, etc.) - the in-house agent runtime is just
// another caller of the same registry, so there is a single source of
// truth for what each tool does.
export const AGENT_TOOLS = [
  getLineageTool,
  getGovernedSchemaTool,
  vectorSearchTool,
  checkDownstreamImpactTool,
  listCatalogTablesTool,
];

// Tool-schema params the model must never control. RBAC role always comes
// from the authenticated caller and is injected server-side in
// executeTool() - it is deleted from the model-visible function declaration
// below so the model has no vocabulary to request a different role at the
// tool boundary, regardless of what the user's message asks it to do.
const CALLER_CONTROLLED_PARAMS = new Set(['userRole']);

function toGeminiType(jsonType: string | undefined): Type {
  switch (jsonType) {
    case 'string': return Type.STRING;
    case 'number': return Type.NUMBER;
    case 'integer': return Type.INTEGER;
    case 'boolean': return Type.BOOLEAN;
    case 'array': return Type.ARRAY;
    case 'object': return Type.OBJECT;
    default: return Type.STRING;
  }
}

function toGeminiParameters(inputSchema: any) {
  const properties: Record<string, any> = {};
  for (const [key, val] of Object.entries<any>(inputSchema.properties || {})) {
    if (CALLER_CONTROLLED_PARAMS.has(key)) continue;
    properties[key] = { type: toGeminiType(val.type), description: val.description };
  }
  const required = (inputSchema.required || []).filter((name: string) => !CALLER_CONTROLLED_PARAMS.has(name));
  return { type: Type.OBJECT, properties, required };
}

export function buildFunctionDeclarations(): FunctionDeclaration[] {
  return AGENT_TOOLS.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: toGeminiParameters(tool.inputSchema),
  }));
}

export interface ToolExecutionContext {
  role: Role;
  useHyde?: boolean;
}

export interface ToolCallTrace {
  name: string;
  args: Record<string, unknown>;
  result: unknown;
  error?: string;
}

/**
 * Executes a model-requested tool call. `rawArgs` comes straight from the
 * LLM and is never trusted for identity/role - the caller's real role
 * (`ctx.role`) always overwrites whatever the model did or didn't send.
 */
export async function executeTool(
  name: string,
  rawArgs: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<ToolCallTrace> {
  const role = normalizeRole(ctx.role);
  const tool = AGENT_TOOLS.find(t => t.name === name);

  if (!tool) {
    return { name, args: { ...rawArgs, userRole: role }, result: null, error: `Unknown tool: ${name}` };
  }

  const execArgs: Record<string, unknown> = { ...rawArgs, userRole: role };
  let hydeUsed = false;

  if (ctx.useHyde && name === 'search_business_glossary' && typeof execArgs.query === 'string') {
    const hydeDoc = await generateHydeDocument(execArgs.query);
    if (hydeDoc) {
      execArgs.__embedText = hydeDoc;
      hydeUsed = true;
    }
  }

  const traceArgs = { ...rawArgs, userRole: role, ...(hydeUsed ? { hydeExpansionUsed: true } : {}) };

  try {
    const output: any = await tool.execute(execArgs as any);
    const text = output?.content?.[0]?.text;
    const result = typeof text === 'string' ? JSON.parse(text) : output;
    return { name, args: traceArgs, result };
  } catch (err) {
    return { name, args: traceArgs, result: null, error: err instanceof Error ? err.message : String(err) };
  }
}
