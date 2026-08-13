import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { getLineageTool } from './tools/get-lineage.js';
import { getGovernedSchemaTool } from './tools/get-governed-schema.js';
import { vectorSearchTool } from './tools/search-metadata.js';
import { checkDownstreamImpactTool } from './tools/check-downstream-impact.js';
import { listCatalogTablesTool } from './tools/list-catalog-tables.js';

const tools = [
  getLineageTool,
  getGovernedSchemaTool,
  vectorSearchTool,
  checkDownstreamImpactTool,
  listCatalogTablesTool,
];

const server = new Server(
    { name: 'MetaGraph-MCP', version: '1.0.0' },
    { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }))
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = tools.find(t => t.name === request.params.name);
    if (!tool) throw new Error(`Tool not found: ${request.params.name}`);
    return await tool.execute(request.params.arguments);
});

async function main() {
    // Tools read directly from Postgres/Neo4j/Qdrant per call - no in-memory
    // cache to hydrate.
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch((err) => console.error('[MCP Server Error]', err));