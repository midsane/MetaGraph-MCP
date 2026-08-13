import neo4j from 'neo4j-driver';
import { config } from './env.js';

// Driver is thread-safe and manages its own connection pool
export const neo4jDriver = neo4j.driver(
  config.neo4j.uri,
  neo4j.auth.basic(config.neo4j.user, config.neo4j.password),
);