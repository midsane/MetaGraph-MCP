import { LineageDAG } from './lineage-dag.js';
import { vectorStore } from './vector-store.js';

export class MetadataStore {
  constructor() {
    this.dag = new LineageDAG();
    this.tableSchemas = new Map();
    this.tableMetadata = new Map();
    this.initialized = false;
  }

  /**
   * Hydrate in-memory state (DAG & schemas) from Qdrant DB on startup
   */
  async loadFromDb() {
    if (this.initialized) return;

    try {
      await vectorStore.init();
      
      // Scroll stored table metadata points from Qdrant collection
      const scrollResult = await vectorStore.getQdrantClient().scroll(
        vectorStore.getCollectionName(), 
        { limit: 200, with_payload: true }
      );

      const points = scrollResult.points || [];

      for (const point of points) {
        const payload = point.payload;
        if (!payload || !payload.tableName) continue;

        const { tableName, column_metadata, business_description, confidence_score, lineage_dependencies } = payload;

        // 1. Hydrate Schemas
        const columns = column_metadata ? column_metadata.map(c => c.name || c) : [];
        this.tableSchemas.set(tableName, columns);

        // 2. Hydrate Metadata Cache
        this.tableMetadata.set(tableName, {
          business_description,
          confidence_score,
          column_metadata
        });

        // 3. Hydrate Lineage DAG
        if (Array.isArray(lineage_dependencies)) {
          lineage_dependencies.forEach(src => {
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

    // Update in-memory schemas
    this.tableSchemas.set(tableName, columns);

    // Get upstream dependencies from Lineage DAG for this table
    const lineage = this.dag.getParents(tableName) || [];

    // Format text representation for Gemini Embeddings
    const columnsText = columns.map(c => (typeof c === 'object' ? `${c.name} (${c.description || ''})` : c)).join(', ');
    const description = docPayload?.business_description || `Database table storing ${tableName} records.`;

    const textContent = `Table: ${tableName}. Description: ${description}. Columns: ${columnsText}. Upstream Dependencies: ${lineage.join(', ')}`;

    const metadataPayload = {
      business_description: description,
      confidence_score: docPayload?.confidence_score || 0.5,
      column_metadata: docPayload?.column_metadata || columns.map(c => ({
        name: typeof c === 'string' ? c : c.name,
        description: c.description || 'Raw column',
        is_pii: c.is_pii || false
      })),
      lineage_dependencies: lineage
    };

    // Cache metadata in memory
    this.tableMetadata.set(tableName, metadataPayload);

    // Index vector embedding & store point payload in Qdrant DB
    await vectorStore.indexMetadata(tableName, textContent, metadataPayload);
  }

  /**
   * Get column list for a table
   */
  getSchema(tableName) {
    return this.tableSchemas.get(tableName) || [];
  }

  /**
   * Get cached metadata details
   */
  getMetadata(tableName) {
    return this.tableMetadata.get(tableName) || null;
  }

  /**
   * Record lineage edge and sync to Qdrant
   */
  async addLineageDependency(targetTable, sourceTable) {
    await this.loadFromDb();
    this.dag.addEdge(targetTable, sourceTable);

    // Re-index target table metadata with updated lineage list
    const existingSchema = this.getSchema(targetTable);
    const existingMeta = this.getMetadata(targetTable);

    if (existingSchema.length > 0) {
      await this.saveTableMetadata(targetTable, existingSchema, existingMeta);
    }
  }
}

export const store = new MetadataStore();