import express from 'express';
import { LineageEngine } from './lineage-engine.js';
import { ScribeAgent } from './scribe-agent.js';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
app.use(express.json());

const lineage = new LineageEngine();
lineage.parseQueries([
  "CREATE TABLE stg_orders AS SELECT order_id, user_id, amount FROM raw_orders;",
  "CREATE TABLE mrt_revenue AS SELECT user_id, SUM(amount) as net_rev FROM stg_orders GROUP BY user_id;"
]);

// Endpoint 1: Get Visual Graph Data
app.get('/api/lineage', (req, res) => {
  res.json(lineage.getGraphExport());
});

// Endpoint 2: Trigger Scribe Agent Documentation
app.post('/api/document', async (req, res) => {
  const { tableName, columns } = req.body;
  const metadata = await ScribeAgent.documentSchema(tableName, columns || ['id', 'user_email', 'total']);
  res.json(metadata);
});

// UI Route: Simple HTML Visualizer
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>AtlanContext Lineage & Metadata Engine</title>
      <style>
        body { font-family: monospace; background: #0f172a; color: #f8fafc; padding: 2rem; }
        .card { background: #1e293b; padding: 1.5rem; border-radius: 8px; margin-bottom: 1rem; border: 1px solid #334155; }
        pre { color: #38bdf8; overflow-x: auto; }
        button { background: #3b82f6; color: white; border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; }
      </style>
    </head>
    <body>
      <h1>🚀 AtlanContext-MCP Engine Dashboard</h1>
      
      <div class="card">
        <h3>Active SQL Lineage Graph (DAG)</h3>
        <button onclick="fetchLineage()">Fetch Lineage</button>
        <pre id="lineageOutput">// Click button to inspect Lineage Graph</pre>
      </div>

      <div class="card">
        <h3>Scribe Metadata Agent Test</h3>
        <button onclick="runScribe()">Auto-Document 'raw_orders'</button>
        <pre id="scribeOutput">// Click button to trigger Scribe Agent</pre>
      </div>

      <script>
        async function fetchLineage() {
          const res = await fetch('/api/lineage');
          const data = await res.json();
          document.getElementById('lineageOutput').innerText = JSON.stringify(data, null, 2);
        }

        async function runScribe() {
          document.getElementById('scribeOutput').innerText = 'Running Scribe Agent...';
          const res = await fetch('/api/document', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tableName: 'raw_orders', columns: ['order_id', 'customer_email', 'ssn', 'amount'] })
          });
          const data = await res.json();
          document.getElementById('scribeOutput').innerText = JSON.stringify(data, null, 2);
        }
      </script>
    </body>
    </html>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Dashboard running at http://localhost:${PORT}`));