import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import { config } from '../config/env.js';

// Import Modular Routers
import lineageRouter from './routes/lineage.js';
import askRouter from './routes/ask.js';
import execRouter from './routes/exec.js';
import purgeRouter from './routes/purge.js';
import catalogRouter from './routes/catalog.js';
import governanceRouter from './routes/governance.js';
import syncRouter from './routes/sync.js';
import retrieveBusinessDbRouter from './routes/retrieve-business-db.js';
import retrieveCatalogDbRouter from './routes/retrieve-catalog-db.js';

const app = express();
// The Vite client runs on a different origin during local development.
app.use(cors());
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
  // Supports TS sources in development and emitted JS in the production image.
  apis: ['./src/server/routes/*.{ts,js}']
};

/** Basic health check endpoint. */
app.get("/", (req, res)=> {
  return res.status(200).json({"server healthy": true})
})

const swaggerDocs = swaggerJsdoc(swaggerOptions);
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// Mount Routes
app.use('/api/lineage', lineageRouter);
app.use('/api/ask', askRouter);
app.use('/api/exec', execRouter);
app.use('/api/purge', purgeRouter);
app.use('/api/catalog', catalogRouter);
app.use('/api/governance', governanceRouter);
app.use('/api/sync', syncRouter);
app.use('/api/retrieve-business-db', retrieveBusinessDbRouter);
app.use('/api/retrieve-catalog-db', retrieveCatalogDbRouter);

/** Starts the Express REST server on the configured port. */
async function startServer() {
  try {
    app.listen(config.port, () => {
      console.log(`🚀 REST Server running at http://localhost:${config.port}`);
    });
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
