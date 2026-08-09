import express from 'express';
import { config } from '../config/env.js';
import { store } from '../core/metadata-store.js';
import { ScribeAgent } from '../agents/scribe-agent.js';

const app = express();
app.use(express.json());

app.get('/api/lineage', (req, res) => {
  res.json(store.dag.exportGraph());
});

app.post('/api/document', async (req, res) => {
  const { tableName, columns } = req.body;
  const doc = await ScribeAgent.documentTable(tableName, columns || []);
  res.json(doc);
});

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>AtlanContext-MCP Control Plane</title>
      <style>
        body { font-family: monospace; background: #0f172a; color: #f8fafc; padding: 2rem; }
        .card { background: #1e293b; padding: 1.5rem; border-radius: 8px; margin-bottom: 1rem; border: 1px solid #334155; }
        pre { color: #38bdf8; overflow-x: auto; }
        button { background: #3b82f6; color: white; border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; }
      </style>
    </head>
    <body>
      <h1>🚀 AtlanContext-MCP Control Plane</h1>
      <div class="card">
        <h3>Metadata Graph State</h3>
        <button onclick="loadGraph()">Fetch DAG Graph</button>
        <pre id="graphOutput">// Click to load live DAG JSON</pre>
      </div>
      <script>
        async function loadGraph() {
          const res = await fetch('/api/lineage');
          const data = await res.json();
          document.getElementById('graphOutput').innerText = JSON.stringify(data, null, 2);
        }
      </script>
    </body>
    </html>
  `);
});

app.listen(config.port, () => console.log(`🚀 REST Dashboard running at http://localhost:${config.port}`));