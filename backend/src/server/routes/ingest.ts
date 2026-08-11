import { Router } from 'express';
import { store } from '../../core/metadata-store.js';
import { ScribeAgent } from '../../agents/scribe-agent.js';
import { ASTParser } from '../../core/ast-parser.js';

const router = Router();
const parser = new ASTParser();

/**
 * Helper to strip SQL comments (single-line & multi-line)
 */
function cleanSqlComments(sql) {
  return sql
    .replace(/--.*$/gm, '') // Remove -- single line comments
    .replace(/\/\*[\s\S]*?\*\//g, ''); // Remove /* */ multi-line comments
}

router.post('/', async (req, res) => {
  try {
    const { sqlContent } = req.body;
    if (!sqlContent) return res.status(400).json({ error: 'SQL content is required' });

    // first get rid of comments between sql statements
    const cleanSql = cleanSqlComments(sqlContent);
    const ingestedTables = [];

    // Extract Lineage Dependencies via AST Parser
    const dependencies = parser.extractDependencies(cleanSql);
    if (dependencies.target && dependencies.sources.length > 0) {
      dependencies.sources.forEach(src => {
        store.dag.addEdge(dependencies.target, src);
      });
    }

    // Identify different tables and there columns
    // Pattern A: Standard DDL -> CREATE TABLE name (col1 type, col2 type)
    const ddlRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\);/gi;
    let match;

    while ((match = ddlRegex.exec(cleanSql)) !== null) {
      const tableName = match[1];
      const columnBlock = match[2];

      const columns = columnBlock
        .split(',')
        .map(line => line.trim().split(/\s+/)[0])
        .filter(col => col && !['PRIMARY', 'FOREIGN', 'CONSTRAINT', 'UNIQUE'].includes(col.toUpperCase()));

      const doc = await ScribeAgent.documentSchema(tableName, columns);
      await store.saveTableMetadata(tableName, columns, doc);

      ingestedTables.push({ tableName, columns, type: 'STANDARD_DDL', metadata: doc });
    }

    // 3. Pattern B: CTAS -> CREATE TABLE target_table AS SELECT col1, col2 FROM source_table
    const ctasRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_]+)\s+AS\s+SELECT\s+([\s\S]*?)\s+FROM\s+([a-zA-Z0-9_]+)/gi;

    while ((match = ctasRegex.exec(cleanSql)) !== null) {
      const targetTable = match[1];
      const selectClause = match[2];
      const sourceTable = match[3];

      // Extract column names from SELECT clause (handles "id, full_name, email")
      const columns = selectClause
        .split(',')
        .map(col => col.trim().split(/\s+/).pop().replace(/[^a-zA-Z0-9_]/g, '')) // Handles aliases if present
        .filter(Boolean);

      // Add bi-directional lineage graph edge (target depends on source)
      store.dag.addEdge(targetTable, sourceTable);

      const doc = await ScribeAgent.documentSchema(targetTable, columns);
      await store.saveTableMetadata(targetTable, columns, doc);

      ingestedTables.push({ 
        tableName: targetTable, 
        columns, 
        type: 'CTAS', 
        upstreamSource: sourceTable, 
        metadata: doc 
      });
    }

    return res.status(200).json({ 
      message: 'Ingestion complete', 
      lineage: store.dag.exportGraph(),
      tables: ingestedTables 
    });

  } catch (err) {
    console.error('[Ingest Error]', err);
    res.status(500).json({ error: err.message || 'Internal server error during ingestion' });
  }
});

export default router;