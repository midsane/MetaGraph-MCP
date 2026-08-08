import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { LineageEngine } from './lineage-engine.js';
import { ScribeAgent } from './scribe-agent.js';

// Setup Mock Metadata Store
const lineage = new LineageEngine();
lineage.parseQueries([
  "CREATE TABLE stg_orders AS SELECT order_id, user_id, amount FROM raw_orders;",
  "CREATE TABLE mrt_revenue AS SELECT user_id, SUM(amount) as net_rev FROM stg_orders GROUP BY user_id;"
]);

const mockDatabase = {
  raw_orders: ['order_id', 'user_id', 'customer_email', 'card_number', 'amount'],
  stg_orders: ['order_id', 'user_id', 'amount'],
  mrt_revenue: ['user_id', 'net_rev']
};

// Initialize MCP Server
const server = new Server(
  { name: 'atlan-context-mcp', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// Register MCP Tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'get_table_lineage',
        description: 'Returns upstream dependencies and lineage graph for a given data table.',
        inputSchema: {
          type: 'object',
          properties: { tableName: { type: 'string' } },
          required: ['tableName']
        }
      },
      {
        name: 'get_governed_schema',
        description: 'Returns table metadata with automatic PII masking based on user role.',
        inputSchema: {
          type: 'object',
          properties: {
            tableName: { type: 'string' },
            userRole: { type: 'string', description: 'ADMIN or ANALYST' }
          },
          required: ['tableName', 'userRole']
        }
      }
    ]
  };
});

// Handle Tool Calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'get_table_lineage') {
    const result = lineage.getUpstreamLineage(args.tableName);
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }

  if (name === 'get_governed_schema') {
    const columns = mockDatabase[args.tableName] || [];
    const doc = await ScribeAgent.documentSchema(args.tableName, columns);

    // Apply PII Governance Masking
    if (args.userRole !== 'ADMIN') {
      doc.column_metadata = doc.column_metadata.map(col => {
        if (col.is_pii) {
          return { ...col, name: `[REDACTED_PII_${col.name.toUpperCase()}]`, description: 'REDACTED (Requires ADMIN role)' };
        }
        return col;
      });
    }

    return { content: [{ type: 'text', text: JSON.stringify(doc, null, 2) }] };
  }

  throw new Error(`Tool not found: ${name}`);
});

// Start Server over Stdio
async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

run().catch(console.error);