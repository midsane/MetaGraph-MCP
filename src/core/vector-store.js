import { QdrantClient } from '@qdrant/js-client-rest';
import { GoogleGenAI } from '@google/genai';
import { config } from '../config/env.js';

const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

// Initialize Qdrant client pointing to local docker or env URL
const qdrantUrl = process.env.QDRANT_URL || 'http://localhost:6333';
const qdrant = new QdrantClient({ url: qdrantUrl });

const COLLECTION_NAME = 'metagraph_metadata_catalog';
const VECTOR_SIZE = 768; // Gemini text-embedding-004 outputs 768-dim vectors

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
        model: 'text-embedding-004',
        contents: text,
      });
      return response.embedding.values;
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
            business_description: metadataPayload.business_description,
            confidence_score: metadataPayload.confidence_score,
            column_metadata: metadataPayload.column_metadata
          }
        }
      ]
    });

    console.log(`[Qdrant] Upserted vector point for table: "${tableName}"`);
  }

  /**
   * Perform Semantic RAG Vector Search over Qdrant
   */
  async searchSemantic(queryText, topK = 3) {
    await this.init();
    const queryVector = await this.getEmbedding(queryText);
    if (!queryVector) return [];

    const searchResults = await qdrant.search(COLLECTION_NAME, {
      vector: queryVector,
      limit: topK,
      with_payload: true
    });

    return searchResults.map(hit => ({
      tableName: hit.payload.tableName,
      business_description: hit.payload.business_description,
      similarity_score: parseFloat(hit.score.toFixed(4)),
      columns: hit.payload.column_metadata
    }));
  }
}

export const vectorStore = new ProductionVectorStore();