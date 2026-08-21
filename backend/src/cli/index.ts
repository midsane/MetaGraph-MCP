#!/usr/bin/env node
import fs from 'fs';
import { SyncEngine } from '../core/sync-engine.js';
import { businessConnector } from '../connectors/postgres-connector.js';
import { stripSqlComments } from '../core/sql-utils.js';
import { runAgent } from '../agent/runtime.js';
import { LlmProviderError } from '../llm/errors.js';

const args = process.argv.slice(2);
const command = args[0];

/** `npm run cli sync` — runs a single syncUp() pass against business-db and prints the result. */
async function runSync() {
  console.log('🔄 Running one-shot syncUp() against business-db...');
  const result = await SyncEngine.syncUp();
  console.log('✅ Sync complete:', JSON.stringify(result, null, 2));
}

/** `npm run cli exec <file>` — strips comments from a SQL file and applies it to business-db. */
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

/** `npm run cli ask "<question>" [--role=...]` — runs the in-house agent runtime and prints its trace and answer. */
async function runAsk(rest: string[]) {
  const roleFlagIndex = rest.findIndex(a => a.startsWith('--role='));
  const role = roleFlagIndex >= 0 ? rest[roleFlagIndex].split('=')[1] : 'ANALYST';
  const queryParts = rest.filter((_, i) => i !== roleFlagIndex);
  const query = queryParts.join(' ').trim();

  if (!query) {
    console.error('Usage: npm run cli ask "<question>" [--role=ADMIN|ANALYST]');
    process.exit(1);
  }

  console.log(`\n⚡ [Agent Runtime] query="${query}" role=${role}\n`);
  const result = await runAgent(query, role, { useHyde: true });

  if (result.skillsLoaded.length) {
    console.log(`🧩 Skills loaded: ${result.skillsLoaded.join(', ')}`);
  }

  console.log(`🔧 Tool calls (${result.toolCalls.length}):`);
  for (const call of result.toolCalls) {
    const status = call.error ? `error: ${call.error}` : 'ok';
    console.log(`   - ${call.name}(${JSON.stringify(call.args)}) -> ${status}`);
  }

  console.log(`\n📎 Matched tables: ${result.matchedTables.join(', ') || 'none'}`);
  console.log(`\n💬 Answer:\n${result.answer}\n`);
}

/** Parses the CLI subcommand from argv and dispatches to the matching handler, or prints usage. */
async function main() {
  if (command === 'sync') {
    await runSync();
  } else if (command === 'exec' && args[1]) {
    await runExec(args[1]);
  } else if (command === 'ask') {
    await runAsk(args.slice(1));
  } else {
    console.log(`
MetaGraph Ingestion CLI
------------------------
Usage:
  npm run cli sync                                Run one-shot syncUp() against business-db
  npm run cli exec <path-to-sql-file>              Apply a SQL file to business-db (triggers event-driven sync)
  npm run cli ask "<question>" [--role=ADMIN|ANALYST]   Ask the in-house AI agent runtime a question

Examples:
  npm run cli sync
  npm run cli exec ./migrations/001_add_column.sql
  npm run cli ask "Which table stores customer emails?" --role=ANALYST
    `);
    process.exit(command ? 1 : 0);
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    if (err instanceof LlmProviderError) {
      console.error(
        `❌ [${err.provider}] ${err.operation} failed (${err.kind}${err.status ? ` ${err.status}` : ''}): ${err.message}`
      );
    } else {
      console.error('[CLI Error]', err);
    }
    process.exit(1);
  });
