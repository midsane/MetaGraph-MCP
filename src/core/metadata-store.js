import { LineageDAG } from './lineage-dag.js';
import { vectorStore } from './vector-store.js';

export class MetadataStore {
  constructor() {
    this.dag = new LineageDAG();
    this.tableSchemas = new Map();  // tableName -> Array of column objects/strings
    this.tableMetadata = new Map(); // tableName -> Metadata object
    this.initialized = false;
  }

  /**
   * Hydrate in-memory state (DAG & schemas) from Qdrant DB on startup
   */
  async loadFromDb() {
    if (this.initialized) return;

    try {
      await vectorStore.init();
      
      const scrollResult = await vectorStore.getQdrantClient().scroll(
        vectorStore.getCollectionName(), 
        { limit: 500, with_payload: true }
      );

      const points = scrollResult.points || [];

      for (const point of points) {
        const payload = point.payload;
        if (!payload || !payload.tableName) continue;

        const { 
          tableName, 
          column_metadata, 
          business_description, 
          confidence_score, 
          upstream_dependencies 
        } = payload;

        // 1. Hydrate Schemas
        const columns = column_metadata ? column_metadata.map(c => c.name || c) : [];
        this.tableSchemas.set(tableName, columns);

        // 2. Hydrate Metadata Cache
        this.tableMetadata.set(tableName, {
          business_description,
          confidence_score,
          column_metadata: column_metadata || []
        });

        // 3. Hydrate Lineage DAG (Upstream Edges)
        if (Array.isArray(upstream_dependencies)) {
          upstream_dependencies.forEach(src => {
            this.dag.addEdge(tableName, src);
          });
        }
      }

      this.initialized = true;
      console.log(`[MetadataStore] Hydrated ${points.length} tables & lineage DAG from Qdrant DB.`);
    } catch (err) {
      console.error('[MetadataStore] Load from DB error:', err.message);
    }
  }

  /**
   * Save table schema, auto-generated documentation, and lineage to Qdrant
   */
  async saveTableMetadata(tableName, columns, docPayload = null) {
    await this.loadFromDb();

    // Store in-memory
    this.tableSchemas.set(tableName, columns.map(c => (typeof c === 'object' ? c.name : c)));

    // Extract Bi-Directional Lineage
    const upstream = this.dag.getParents(tableName) || [];
    const downstream = this.dag.getDownstream(tableName)?.downstream_dependencies || [];

    // Format text representation for Gemini Embeddings
    const columnsText = columns.map(c => (typeof c === 'object' ? `${c.name} (${c.description || ''})` : c)).join(', ');
    const description = docPayload?.business_description || `Database table storing ${tableName} records.`;

    const textContent = `Table: ${tableName}. Description: ${description}. Columns: ${columnsText}. Upstream Lineage: ${upstream.join(', ') || 'None'}. Downstream Impact: ${downstream.join(', ') || 'None'}`;

    const columnMetadata = docPayload?.column_metadata || columns.map(c => ({
      name: typeof c === 'string' ? c : c.name,
      description: typeof c === 'object' && c.description ? c.description : 'Raw column',
      is_pii: typeof c === 'object' && c.is_pii !== undefined ? c.is_pii : false
    }));

    const metadataPayload = {
      tableName,
      business_description: description,
      confidence_score: docPayload?.confidence_score || 0.5,
      column_metadata: columnMetadata,
      upstream_dependencies: upstream,
      downstream_dependents: downstream
    };

    // Cache metadata in memory
    this.tableMetadata.set(tableName, metadataPayload);

    // Index vector embedding & store point payload in Qdrant DB
    await vectorStore.indexMetadata(tableName, textContent, metadataPayload);
  }

  /**
   * Smart Incremental Schema Merging (Handles ALTER TABLE / ADD / DROP)
   */
  async mergeTableSchema(tableName, incomingColumns, scribeAgent) {
    await this.loadFromDb();

    const existingMeta = this.getMetadata(tableName);
    const existingColsMap = new Map();

    if (existingMeta && existingMeta.column_metadata) {
      existingMeta.column_metadata.forEach(c => existingColsMap.set(c.name, c));
    }

    const updatedColumnMetadata = [];
    const newColumnsToDocument = [];

    // Identify new vs existing columns
    for (const colName of incomingColumns) {
      if (existingColsMap.has(colName)) {
        // Retain existing agent-generated metadata & PII tags
        updatedColumnMetadata.push(existingColsMap.get(colName));
      } else {
        // Flag new column for incremental documentation
        newColumnsToDocument.push(colName);
      }
    }

    // If new columns exist, run Scribe Agent only on those!
    if (newColumnsToDocument.length > 0 && scribeAgent) {
      console.log(`[MetadataStore] Running Scribe Agent for new columns in ${tableName}: [${newColumnsToDocument.join(', ')}]`);
      const newDoc = await scribeAgent.documentSchema(tableName, newColumnsToDocument);

      if (newDoc && newDoc.column_metadata) {
        updatedColumnMetadata.push(...newDoc.column_metadata);
      }
    }

    const docPayload = {
      business_description: existingMeta?.business_description || `Table storing ${tableName} records.`,
      confidence_score: existingMeta?.confidence_score || 0.8,
      column_metadata: updatedColumnMetadata
    };
                        
    await this.saveTableMetadata(tableName, incomingColumns, docPayload);
  }

  /**
   * Record lineage edge and Sync BOTH Target and Source to Qdrant
   */
  async addLineageDependency(targetTable, sourceTable) {
    await this.loadFromDb();
    
    // 1. Add edge in DAG
    this.dag.addEdge(targetTable, sourceTable);

    // 2. Re-index TARGET table (updates upstream dependencies)
    const targetSchema = this.getSchema(targetTable);
    const targetMeta = this.getMetadata(targetTable);
    if (targetSchema.length > 0) {
      await this.saveTableMetadata(targetTable, targetSchema, targetMeta);
    }

    // 3. Re-index SOURCE table (updates downstream impact dependents!)
    const sourceSchema = this.getSchema(sourceTable);
    const sourceMeta = this.getMetadata(sourceTable);
    if (sourceSchema.length > 0) {
      await this.saveTableMetadata(sourceTable, sourceSchema, sourceMeta);
    }
  }

  getSchema(tableName) {
    return this.tableSchemas.get(tableName) || [];
  }

  getMetadata(tableName) {
    return this.tableMetadata.get(tableName) || null;
  }
  /**
   * Clears in-memory DAG/Schemas and purges the Vector DB
   */
  async purge() {
    this.dag.graph.clear();
    this.tableSchemas.clear();
    this.tableMetadata.clear();
    this.initialized = false;
    await vectorStore.purge();
    console.log('[MetadataStore] Memory cache and DAG cleared.');
  }
}

export const store = new MetadataStore();