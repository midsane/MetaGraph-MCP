#!/usr/bin/env node
import fs from 'fs';
import { SyncEngine } from '../core/sync-engine.js';
import { businessConnector } from '../connectors/postgres-connector.js';
import { stripSqlComments } from '../core/sql-utils.js';

const args = process.argv.slice(2);
const command = args[0];

async function runSync() {
  console.log('🔄 Running one-shot syncUp() against business-db...');
  const result = await SyncEngine.syncUp();
  console.log('✅ Sync complete:', JSON.stringify(result, null, 2));
}

async function runExec(filePath: string) {
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  // Applies the file's SQL to business-db AND logs each statement to
  // query_logs, simulating a migration/query landing on the live business
  // database. This fires the DDL/query_logs triggers installed there - if
  // the event listener (`npm run sync:watch`) is running, catalog-db/Neo4j/
  // Qdrant update automatically in response, lineage included.
  const sqlContent = fs.readFileSync(filePath, 'utf-8');
  const cleanSql = stripSqlComments(sqlContent);

  console.log(`⚡ Applying SQL from ${filePath} to business-db...`);
  const { statementsApplied } = await businessConnector.applyAndLog(cleanSql);
  console.log(`✅ ${statementsApplied} statement(s) applied and logged. If the event listener (npm run sync:watch) is running, catalog-db/Neo4j/Qdrant will update automatically.`);
}

async function main() {
  if (command === 'sync') {
    await runSync();
  } else if (command === 'exec' && args[1]) {
    await runExec(args[1]);
  } else {
    console.log(`
MetaGraph Ingestion CLI
------------------------
Usage:
  npm run cli sync                       Run one-shot syncUp() against business-db
  npm run cli exec <path-to-sql-file>    Apply a SQL file to business-db (triggers event-driven sync)

Examples:
  npm run cli sync
  npm run cli exec ./migrations/001_add_column.sql
    `);
    process.exit(command ? 1 : 0);
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('[CLI Error]', err);
    process.exit(1);
  });
