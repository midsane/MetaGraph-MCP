import { QdrantClient } from '@qdrant/js-client-rest';
import { config } from '../config/env.js';
import { getLlmProvider } from '../llm/index.js';
import { EMBEDDING_DIMENSIONS } from '../llm/constants.js';

const qdrant = new QdrantClient({ url: config.qdrant.url });

const COLLECTION_NAME = 'metagraph_metadata_catalog';
const VECTOR_SIZE = EMBEDDING_DIMENSIONS;

export interface SearchResult {
  tableName: string;
  tableId: number | null;
  business_description: string;
  similarity_score: number;
}

export class ProductionVectorStore {
  private initialized: boolean;

  /** Creates the store in an uninitialized state; init() lazily creates the Qdrant collection on first use. */
  constructor() {
    this.initialized = false;
  }

  /**
   * Ensures the Qdrant collection exists with Cosine distance indexing
   */
  async init() {
    if (this.initialized) return;
    try {
      const collections = await qdrant.getCollections();
      const exists = collections.collections.some(c => c.name === COLLECTION_NAME);

      if (!exists) {
        await qdrant.createCollection(COLLECTION_NAME, {
          vectors: { size: VECTOR_SIZE, distance: 'Cosine' }
        });
        console.log(`[Qdrant] Created vector collection: "${COLLECTION_NAME}"`);
      }
      this.initialized = true;
    } catch (err: any) {
      console.error('[Qdrant] Initialization error:', err.message);
    }
  }

  /**
   * Generates an embedding vector via whichever provider LLM_PROVIDER
   * selects (see src/llm/index.ts). Both providers are validated to return
   * EMBEDDING_DIMENSIONS-length vectors so the Qdrant collection stays
   * compatible regardless of which one produced a given point.
   */
  async getEmbedding(text: string): Promise<number[] | null> {
    return getLlmProvider().embed(text);
  }

  /**
   * Generates a deterministic integer point ID from the table name
   */
  private getPointId(tableName: string): number {
    return Math.abs(
      tableName.split('').reduce((acc, char) => (acc << 5) - acc + char.charCodeAt(0), 0)
    );
  }

  /**
   * Index or update a table's business definition vector in Qdrant.
   * POINTER PATTERN: stores the business_description, tableName, and the
   * table's id in catalog-db (the join key back to Postgres for columns/PII).
   * Schema/Columns & Lineage are joined dynamically at runtime from Postgres and Neo4j.
   */
  async indexMetadata(tableName: string, businessDescription: string, tableId: number) {
    await this.init();

    // Embed the table context (Table Name + Business Summary)
    const textToEmbed = `Table: ${tableName}\nDescription: ${businessDescription}`;
    const vector = await this.getEmbedding(textToEmbed);
    if (!vector) return;

    const pointId = this.getPointId(tableName);

    await qdrant.upsert(COLLECTION_NAME, {
      points: [
        {
          id: pointId,
          vector: vector,
          payload: {
            tableName,
            tableId,
            business_description: businessDescription
          }
        }
      ]
    });

    console.log(`[Qdrant] Indexed vector & business summary pointer for table: "${tableName}"`);
  }

  /**
   * Perform Semantic Search over business descriptions in Qdrant.
   * Returns pointers (tableName) to be hydrated by Postgres & Neo4j.
   */
  async searchSemantic(queryText: string, topK = 3): Promise<SearchResult[]> {
    await this.init();
    const queryVector = await this.getEmbedding(queryText);
    if (!queryVector) return [];

    let hits: Array<{ payload?: Record<string, unknown>; score?: number }> = [];

    // 1. Universal Query API (Qdrant JS SDK v1.10+)
    if (typeof qdrant.query === 'function') {
      const response = await qdrant.query(COLLECTION_NAME, {
        query: queryVector,
        limit: topK,
        with_payload: true
      });
      hits = (response.points || response || []) as typeof hits;
    }
    // 2. Legacy search fallback
    else if (typeof (qdrant as any).search === 'function') {
      hits = await (qdrant as any).search(COLLECTION_NAME, {
        vector: queryVector,
        limit: topK,
        with_payload: true
      });
    }

    return hits.map(hit => {
      const payload = hit.payload as { tableName?: string; tableId?: number; business_description?: string };
      return {
        tableName: payload?.tableName || '',
        tableId: payload?.tableId ?? null,
        business_description: payload?.business_description || '',
        similarity_score: parseFloat((hit.score || 0).toFixed(4))
      };
    });
  }

  /**
   * Remove a table's vector from Qdrant when dropped from live DB
   */
  async deleteTableContext(tableName: string) {
    await this.init();
    const pointId = this.getPointId(tableName);
    try {
      await qdrant.delete(COLLECTION_NAME, {
        wait: true,
        points: [pointId]
      });
      console.log(`[Qdrant] Deleted vector index for dropped table: "${tableName}"`);
    } catch (err: any) {
      console.error(`[Qdrant] Failed to delete table index for ${tableName}:`, err.message);
    }
  }

  /**
   * Returns Qdrant client instance
   */
  getQdrantClient() {
    return qdrant;
  }

  /**
   * Returns Qdrant collection name
   */
  getCollectionName() {
    return COLLECTION_NAME;
  }

  /**
   * Completely deletes and re-initializes the Qdrant vector collection
   */
  async purge() {
    try {
      const collections = await qdrant.getCollections();
      const exists = collections.collections.some(c => c.name === COLLECTION_NAME);

      if (exists) {
        await qdrant.deleteCollection(COLLECTION_NAME);
        console.log(`[Qdrant] Deleted collection: "${COLLECTION_NAME}"`);
      }

      this.initialized = false;
      await this.init();
    } catch (err: any) {
      console.error('[Qdrant] Purge error:', err.message);
    }
  }
}

export const vectorStore = new ProductionVectorStore();