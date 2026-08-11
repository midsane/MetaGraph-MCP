#!/usr/bin/env node
import fs from 'fs';
import { ASTParser } from '../core/ast-parser.js';
import { store } from '../core/metadata-store.js';
import { ScribeAgent } from '../agents/scribe-agent.js';

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

  console.log(`🔍 Processing ${queries.length} SQL migration statements from ${filePath}...`);

  // 1. Extract and sync DDL Table Schemas incrementally
  const ddlEntries = parser.extractDDLSchemas(sqlContent);
  for (const entry of ddlEntries) {
    if (entry.type === 'CREATE') {
      console.log(`📦 Found CREATE TABLE [${entry.tableName}] with ${entry.columns.length} columns.`);
      await store.mergeTableSchema(entry.tableName, entry.columns, ScribeAgent);
    } else if (entry.type === 'ALTER_ADD') {
      console.log(`➕ Found ALTER TABLE [${entry.tableName}] ADD COLUMN [${entry.columns[0]}].`);
      const existingCols = store.getSchema(entry.tableName);
      const updatedCols = Array.from(new Set([...existingCols, ...entry.columns]));
      await store.mergeTableSchema(entry.tableName, updatedCols, ScribeAgent);
    }
  }

  // 2. Extract and sync Lineage DAG (Updates BOTH Target and Source in Qdrant)
  for (const q of queries) {
    const { sources, target } = parser.extractDependencies(q);
    if (target) {
      for (const src of sources) {
        await store.addLineageDependency(target, src);
        console.log(`🔗 Lineage mapped: ${src} ──> ${target}`);
      }
    }
  }

  console.log('✅ Ingestion complete! Lineage DAG & Metadata auto-indexed to Qdrant Vector DB.');
  process.exit(0);

} else {
  console.log(`
Atlan Active Metadata CLI
-------------------------
Usage:
  node src/cli/index.js ingest <path-to-sql-file.sql>

Example:
  node src/cli/index.js ingest ./migrations/001_init.sql
  `);
}