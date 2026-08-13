import dotenv from 'dotenv';
// Suppress stdout logs so MCP JSON-RPC protocol stream is never corrupted
dotenv.config({ quiet: true });

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-flash-latest',
  geminiEmbeddingModel: process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-2',
  port: envInt('PORT', 3000),
  nodeEnv: process.env.NODE_ENV || 'development',

  // Which backend every text-generation and embedding call in src/llm/ routes
  // through. 'gemini' (default) or 'openrouter'. See src/llm/index.ts.
  llmProvider: (process.env.LLM_PROVIDER || 'gemini').toLowerCase(),

  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY || '',
    model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
    embeddingModel: process.env.OPENROUTER_EMBEDDING_MODEL || 'openai/text-embedding-3-small',
  },

  // MetaGraph's own catalog store: tables, columns, PII tags, sync watermark.
  catalogDb: {
    host: process.env.CATALOG_DB_HOST || 'localhost',
    port: envInt('CATALOG_DB_PORT', 5434),
    user: process.env.CATALOG_DB_USER || 'admin',
    password: process.env.CATALOG_DB_PASSWORD || 'password123',
    database: process.env.CATALOG_DB_NAME || 'metagraph',
  },

  // External/company database that owns the live business data. MetaGraph
  // only ever reads from it via the PostgresConnector.
  businessDb: {
    host: process.env.BUSINESS_DB_HOST || 'localhost',
    port: envInt('BUSINESS_DB_PORT', 5433),
    user: process.env.BUSINESS_DB_USER || 'business_admin',
    password: process.env.BUSINESS_DB_PASSWORD || 'business_password123',
    database: process.env.BUSINESS_DB_NAME || 'business',
    schema: process.env.BUSINESS_DB_SCHEMA || 'target_db',
  },

  neo4j: {
    uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
    user: process.env.NEO4J_USER || 'neo4j',
    password: process.env.NEO4J_PASSWORD || 'password123',
  },

  qdrant: {
    url: process.env.QDRANT_URL || 'http://localhost:6333',
  },

  // How long the event listener waits after the last notification before
  // running syncUp(), so a burst of DDL statements collapses into one sync.
  syncDebounceMs: envInt('SYNC_DEBOUNCE_MS', 1500),
};

export function businessDbConnectionString(): string {
  const { user, password, host, port, database } = config.businessDb;
  return `postgres://${user}:${password}@${host}:${port}/${database}`;
}
