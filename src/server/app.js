import express from 'express';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import { config } from '../config/env.js';
import { store } from '../core/metadata-store.js';
import { vectorStore } from '../core/vector-store.js';
import { ScribeAgent } from '../agents/scribe-agent.js';

const app = express();
app.use(express.json());

// OpenAPI / Swagger Configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'AtlanContext-MCP Control API',
      version: '1.0.0',
      description: 'Active Metadata Engine REST API & Vector Context Search Layer'
    },
    servers: [{ url: `http://localhost:${config.port}` }]
  },
  apis: ['./src/server/app.js']
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

/**
 * @openapi
 * /api/lineage:
 *   get:
 *     summary: Retrieve current SQL Lineage Graph DAG
 *     responses:
 *       200:
 *         description: Successful graph payload
 */
app.get('/api/lineage', (req, res) => {
  res.json(store.dag.exportGraph());
});

/**
 * @openapi
 * /api/search:
 *   post:
 *     summary: Semantic Vector Search over metadata embeddings (RAG)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               query:
 *                 type: string
 *     responses:
 *       200:
 *         description: Top matching metadata context entries
 */
app.post('/api/search', async (req, res) => {
  const { query } = req.body;
  const results = await vectorStore.searchSemantic(query, 3);
  res.json({ query, matches: results });
});

/**
 * @openapi
 * /api/document:
 *   post:
 *     summary: Trigger Scribe Agent auto-documentation and vector indexing
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               tableName:
 *                 type: string
 *               columns:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Generated business metadata
 */
app.post('/api/document', async (req, res) => {
  const { tableName, columns } = req.body;
  const doc = await ScribeAgent.documentTable(tableName, columns || []);
  
  // RAG Integration: Automatically index generated documentation into Vector Store
  const textToIndex = `Table: ${tableName}. Description: ${doc.business_description}. Columns: ${columns.join(', ')}`;
  await vectorStore.indexMetadata(tableName, textToIndex, doc);

  res.json(doc);
});

app.listen(config.port, () => {
  console.log(`🚀 REST Server running at http://localhost:${config.port}`);
  console.log(`📚 Interactive Swagger API Docs available at http://localhost:${config.port}/docs`);
});