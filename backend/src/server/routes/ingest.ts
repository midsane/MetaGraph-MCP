import { Router } from 'express';
import { store } from '../../core/metadata-store.js';
import { ScribeAgent } from '../../agents/scribe-agent.js';
import { vectorStore } from '../../core/vector-store.js';
import { ASTParser } from '../../core/ast-parser.js';

const router = Router();
const parser = new ASTParser();

/**
 * @openapi
 * /api/ingest:
 *   post:
 *     summary: ingest the provided sql query to identify relationship between tables and generated business definitions of tables and pii tagging of columns
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               sqlContent:
 *                 type: string
 *     responses:
 *       200:
 *         description: ingestion complete
 */
router.post('/', async (req, res) => {
  //whats required here
  //first git rid of comments, get only sql queries in linear fashion
  //then using queries, add/update columuns in table accordingly in metadatastore 
  // (insert, update, delete query can update table col)

  //also get dependencies from each query , and update lineage dag graph


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

    console.log('dependecnies', dependencies)

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

    res.status(200).json({ 
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