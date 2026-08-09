import { GoogleGenAI } from '@google/genai';
import { config } from '../config/env.js';

const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

// Vector Math: Cosine Similarity between two embedding vectors
function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export class VectorMetadataStore {
  constructor() {
    // Array of { id, text, metadata, embedding }
    this.vectors = [];
  }

  /**
   * Generates embedding vector for metadata text using Gemini
   */
  async getEmbedding(text) {
    try {
      const response = await ai.models.embedContent({
        model: 'text-embedding-004',
        contents: text,
      });
      return response.embedding.values;
    } catch (err) {
      console.error('[VectorStore] Embedding error:', err.message);
      return null;
    }
  }

  /**
   * Index table/column metadata into the Vector Store
   */
  async indexMetadata(id, text, metadata) {
    const embedding = await this.getEmbedding(text);
    if (embedding) {
      this.vectors.push({ id, text, metadata, embedding });
      console.log(`[VectorStore] Indexed vector embedding for: ${id}`);
    }
  }

  /**
   * Perform Semantic Vector Search (RAG)
   */
  async searchSemantic(queryText, topK = 3) {
    const queryEmbedding = await this.getEmbedding(queryText);
    if (!queryEmbedding) return [];

    const scored = this.vectors.map(item => ({
      ...item,
      score: cosineSimilarity(queryEmbedding, item.embedding)
    }));

    // Sort by highest cosine similarity
    scored.sort((a, b) => b.score - a.score);
    
    return scored.slice(0, topK).map(({ id, text, metadata, score }) => ({
      id,
      text,
      metadata,
      similarity_score: parseFloat(score.toFixed(4))
    }));
  }
}

export const vectorStore = new VectorMetadataStore();