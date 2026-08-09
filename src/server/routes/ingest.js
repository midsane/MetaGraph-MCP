import { Router } from 'express';
import { store } from '../../core/metadata-store.js';
import { ScribeAgent } from '../../agents/scribe-agent.js';
import { vectorStore } from '../../core/vector-store.js';
import { ASTParser } from '../../core/ast-parser.js';

const router = Router();
const parser = new ASTParser();

router.post('/', async (req, res) => {
  try {
    const { sqlContent } = req.body;
    if (!sqlContent) return res.status(400).json({ error: 'SQL content is required' });

    // 1. Extract Lineage Dependencies
    const dependencies = parser.extractDependencies(sqlContent);
    if (dependencies.target) {
      dependencies.sources.forEach(src => {
        store.dag.addEdge(dependencies.target, src);
      });
    }

    // 2. Crude but effective Table & Column Extractor from CREATE TABLE statements
    const tableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\(([\s\S]*?)\);/gi;
    let match;
    const ingestedTables = [];

    while ((match = tableRegex.exec(sqlContent)) !== null) {
      const tableName = match[1];
      const columnBlock = match[2];
      
      // Extract column names (first word of each line inside the CREATE TABLE block)
      const columns = columnBlock
        .split(',')
        .map(line => line.trim().split(/\s+/)[0])
        .filter(col => col && !['PRIMARY', 'FOREIGN', 'CONSTRAINT', 'UNIQUE'].includes(col.toUpperCase()));

      // 3. Run Scribe Agent on extracted schema
      const doc = await ScribeAgent.documentSchema(tableName, columns);
      
      // 4. Save to Qdrant & Memory
      await store.saveTableMetadata(tableName, columns, doc);
      
      ingestedTables.push({ tableName, columns, metadata: doc });
    }

    res.json({ 
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