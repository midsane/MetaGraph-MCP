import { Pool } from 'pg';
import { config } from './env.js';

// Connects to MetaGraph's own catalog-db container (see docker-compose.yml)
export const pg = new Pool({
  user: config.catalogDb.user,
  host: config.catalogDb.host,
  database: config.catalogDb.database,
  password: config.catalogDb.password,
  port: config.catalogDb.port,
});

pg.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
  process.exit(-1);
});