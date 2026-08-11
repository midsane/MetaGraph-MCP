import { QdrantClient } from '@qdrant/js-client-rest';
import { GoogleGenAI } from '@google/genai';
import { config } from '../config/env.js';

const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

// Initialize Qdrant client pointing to local docker or env URL
const qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';
const qdrant = new QdrantClient({ url: qdrantUrl });

const COLLECTION_NAME = 'metagraph_metadata_catalog';
const EMBEDDING_MODEL = 'gemini-embedding-2';
const VECTOR_SIZE = 768;

export class ProductionVectorStore {
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
    } catch (err) {
      console.error('[Qdrant] Initialization error:', err.message);
    }
  }

  /**
   * Generates embedding vector via Gemini API
   */
  async getEmbedding(text) {
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
    } catch (err) {
      console.error('[VectorStore] Gemini Embedding error:', err.message);
      return null;
    }
  }

  /**
   * Upsert a metadata document into Qdrant vector index
   */
  async indexMetadata(tableName, textContent, metadataPayload) {
    await this.init();
    const vector = await this.getEmbedding(textContent);
    if (!vector) return;

    // Deterministic numeric ID generation from table name
    const pointId = Math.abs(
      tableName.split('').reduce((acc, char) => (acc << 5) - acc + char.charCodeAt(0), 0)
    );

    await qdrant.upsert(COLLECTION_NAME, {
      points: [
        {
          id: pointId,
          vector: vector,
          payload: {
            tableName,
            textContent,
            business_description: metadataPayload.business_description || '',
            confidence_score: metadataPayload.confidence_score ?? 0.5,
            column_metadata: metadataPayload.column_metadata || [],
            upstream_dependencies: metadataPayload.upstream_dependencies || [],
            downstream_dependents: metadataPayload.downstream_dependents || []
          }
        }
      ]
    });

    console.log(`[Qdrant] Indexed vector & metadata payload for table: "${tableName}"`);
  }

  /**
   * Perform Semantic RAG Vector Search over Qdrant
   */
  /**
     * Perform Semantic RAG Vector Search over Qdrant
     */
  async searchSemantic(queryText, topK = 3) {
    await this.init();
    const queryVector = await this.getEmbedding(queryText);
    if (!queryVector) return [];

    let hits = [];

    // 1. Support Qdrant JS SDK v1.10+ Universal Query API
    if (typeof qdrant.query === 'function') {
      const response = await qdrant.query(COLLECTION_NAME, {
        query: queryVector,
        limit: topK,
        with_payload: true
      });
      hits = response.points || response || [];
    }
    // 2. Fallback for older SDK versions
    else if (typeof qdrant.search === 'function') {
      hits = await qdrant.search(COLLECTION_NAME, {
        vector: queryVector,
        limit: topK,
        with_payload: true
      });
    }

    return hits.map(hit => ({
      tableName: hit.payload?.tableName || '',
      business_description: hit.payload?.business_description || '',
      similarity_score: parseFloat((hit.score || 0).toFixed(4)),
      columns: hit.payload?.column_metadata || [],
      upstream_dependencies: hit.payload?.upstream_dependencies || [],
      downstream_dependents: hit.payload?.downstream_dependents || []
    }));
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
      await this.init(); // Re-create empty collection
    } catch (err) {
      console.error('[Qdrant] Purge error:', err.message);
    }
  }
}

export const vectorStore = new ProductionVectorStore();