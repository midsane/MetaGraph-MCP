#!/usr/bin/env node
import fs from 'fs';
import { ASTParser } from '../core/ast-parser.js';
import { store } from '../core/metadata-store.js';

const args = process.argv.slice(2);
const command = args[0];

if (command === 'ingest' && args[1]) {
  const filePath = args[1];
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const sqlContent = fs.readFileSync(filePath, 'utf-8');
  const parser = new ASTParser();
  const queries = sqlContent.split(';').map(q => q.trim()).filter(Boolean);

  console.log(`🔍 Ingesting ${queries.length} SQL queries...`);
  for (const q of queries) {
    const { sources, target } = parser.extractDependencies(q);
    if (target) {
      sources.forEach(src => store.dag.addEdge(target, src));
      console.log(`  Mapped: ${sources.join(', ')} -> ${target}`);
    }
  }

  store.saveToDisk();
  console.log('✅ Ingestion complete! Metadata persisted to metadata-db.json');
} else if (command === 'schema') {
  const tableName = args[1];
  const columns = args.slice(2);
  store.addSchema(tableName, columns);
  console.log(`✅ Schema registered for ${tableName}: [${columns.join(', ')}]`);
} else {
  console.log(`
Usage:
  atlan-context ingest <path-to-sql-file>
  atlan-context schema <tableName> <col1> <col2> <col3>
  `);
}