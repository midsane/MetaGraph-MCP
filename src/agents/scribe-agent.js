import { GoogleGenAI, Type } from '@google/genai';
import { config } from '../config/env.js';

const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

export class ScribeAgent {
  static async documentTable(tableName, columns) {
    const prompt = `
      You are Scribe, an Atlan Context Agent.
      Analyze database table "${tableName}" with columns: ${JSON.stringify(columns)}.
      
      Output JSON with:
      - business_description: Clear purpose of the table.
      - confidence_score: Number between 0.0 and 1.0.
      - column_metadata: List of objects { name, description, is_pii (boolean) }.
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
                    is_pii: { type: Type.BOOLEAN }
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
      console.error('[ScribeAgent] Gemini API Error:', err.message);
      return {
        business_description: 'Unverified table schema.',
        confidence_score: 0.1,
        column_metadata: columns.map(c => ({ name: c, description: 'Raw column', is_pii: false }))
      };
    }
  }
}