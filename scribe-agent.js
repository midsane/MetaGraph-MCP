import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
dotenv.config({quiet: true});

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export class ScribeAgent {
  /**
   * Auto-documents a table schema and identifies PII columns with confidence scoring.
   */
  static async documentSchema(tableName, columns) {
    const prompt = `
      You are an Atlan Context Agent (Scribe).
      Analyze this database table and its columns:
      Table Name: ${tableName}
      Columns: ${JSON.stringify(columns)}

      Output JSON with:
      1. business_description: Clear summary of what this table stores for business users.
      2. column_metadata: Array of objects with name, description, is_pii (boolean), and category.
      3. confidence_score: A float between 0.0 and 1.0 indicating your confidence.
    `;

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              business_description: { type: Type.STRING },
              confidence_score: { type: Type.NUMBER },
              column_metadata: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    description: { type: Type.STRING },
                    is_pii: { type: Type.BOOLEAN },
                    category: { type: Type.STRING }
                  },
                  required: ['name', 'description', 'is_pii']
                }
              }
            },
            required: ['business_description', 'confidence_score', 'column_metadata']
          }
        }
      });

      return JSON.parse(response.text);
    } catch (err) {
      console.error('[ScribeAgent] Error generating documentation:', err);
      return {
        business_description: 'Raw unverified table.',
        confidence_score: 0.2,
        column_metadata: columns.map(col => ({ name: col, description: 'Unknown', is_pii: false }))
      };
    }
  }
}