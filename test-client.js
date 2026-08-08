import { spawn } from 'child_process';

// Spawn the MCP server process
const serverProcess = spawn('node', ['mcp-server.js'], {
  stdio: ['pipe', 'pipe', 'inherit']
});

// Helper to send JSON-RPC requests over stdin
function sendRequest(request) {
  const message = JSON.stringify(request) + '\n';
  serverProcess.stdin.write(message);
}

// Read responses from stdout
serverProcess.stdout.on('data', (data) => {
  console.log('🔥 MCP SERVER RESPONSE:');
  console.log(data.toString());
  serverProcess.kill();
});

// 1. Send MCP Initialize Request
sendRequest({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "test-client", version: "1.0.0" }
  }
});