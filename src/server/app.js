import express from 'express';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import { config } from '../config/env.js';

// Import Modular Routers
import lineageRouter from './routes/lineage.js';
import searchRouter from './routes/search.js';
import documentRouter from './routes/document.js';
import ingestRouter from './routes/ingest.js';
import purgeRouter from './routes/purge.js';
import catalogRouter from './routes/catalog.js';
import governanceRouter from './routes/governance.js';

const app = express();
app.use(express.json());

// OpenAPI / Swagger Configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'MetaGraph-MCP API',
      version: '1.0.0',
      description: 'Active Metadata Engine REST API & Vector Context Search Layer'
    },
    servers: [{ url: `http://localhost:${config.port}` }]
  },
  // Point Swagger parser to the routes directory
  apis: ['./src/server/routes/*.js']
};

app.get("/", (req, res)=> {
  return res.status(200).json({"server healthy": true})
})

const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// Mount Routes
app.use('/api/lineage', lineageRouter);
app.use('/api/search', searchRouter);
app.use('/api/document', documentRouter);
app.use('/api/ingest', ingestRouter);
app.use('/api/purge', purgeRouter);
app.use('/api/catalog', catalogRouter);
app.use('/api/governance', governanceRouter);

app.listen(config.port, () => {
  console.log(`🚀 REST Server running at http://localhost:${config.port}`);
  console.log(`📚 Interactive Swagger API Docs available at http://localhost:${config.port}/docs`);
});
