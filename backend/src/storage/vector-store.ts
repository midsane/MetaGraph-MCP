import { QdrantClient } from '@qdrant/js-client-rest';
import { GoogleGenAI } from '@google/genai';
import { config } from '../config/env.js';

const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

const qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';
const qdrant = new QdrantClient({ url: qdrantUrl });

const COLLECTION_NAME = 'metagraph_metadata_catalog';
const EMBEDDING_MODEL = 'gemini-embedding-2';
const VECTOR_SIZE = 768;

export interface SearchResult {
  tableName: string;
  business_description: string;
  similarity_score: number;
}

export class ProductionVectorStore {
  private initialized: boolean;

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
   * Generates embedding vector via Gemini API
   */
  async getEmbedding(text: string): Promise<number[] | null> {
    try {
      const response = await ai.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: text,
        config: { outputDimensionality: VECTOR_SIZE },
      });

      const vector = response.embeddings?.[0]?.values;
      if (!Array.isArray(vector) || vector.length !== VECTOR_SIZE) {
        throw new Error(
          `Unexpected embedding response: expected ${VECTOR_SIZE} values, received ${vector?.length ?? 0}.`
        );
      }

      return vector;
    } catch (err: any) {
      console.error('[VectorStore] Gemini Embedding error:', err.message);
      return null;
    }
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
   * POINTER PATTERN: Only stores the business_description and tableName.
   * Schema/Columns & Lineage are joined dynamically at runtime from Postgres and Neo4j.
   */
  async indexMetadata(tableName: string, businessDescription: string) {
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
      const payload = hit.payload as { tableName?: string; business_description?: string };
      return {
        tableName: payload?.tableName || '',
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