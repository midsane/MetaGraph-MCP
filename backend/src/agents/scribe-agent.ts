import { getLlmProvider } from '../llm/index.js';
import type { LlmJsonSchema } from '../llm/types.js';

const DOCUMENT_SCHEMA: LlmJsonSchema = {
  type: 'object',
  properties: {
    business_description: { type: 'string' },
    confidence_score: { type: 'number' },
    column_metadata: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          is_pii: { type: 'boolean' },
        },
        required: ['name', 'description', 'is_pii'],
      },
    },
  },
  required: ['business_description', 'confidence_score', 'column_metadata'],
};

export class ScribeAgent {
  static async documentSchema(tableName, columns) {
    const prompt = `
      You are Scribe, a Context Agent.
      Analyze database table "${tableName}" with columns: ${JSON.stringify(columns)}.

      Output JSON with:
      - business_description: Clear purpose of the table.
      - confidence_score: Number between 0.0 and 1.0.
      - column_metadata: List of objects { name, description, is_pii (boolean) }.
    `;
    try {
      console.log("table:", tableName, "cols:", columns)
      const text = await getLlmProvider().generateJson({ prompt, schema: DOCUMENT_SCHEMA });
      if (!text) throw new Error('empty response from LLM provider');
      return JSON.parse(text);
    } catch (err) {
      console.error('[ScribeAgent] LLM provider error:', err instanceof Error ? err.message : err);
      return {
        business_description: 'Unverified table schema.',
        confidence_score: 0.1,
        column_metadata: columns.map(c => ({ name: c, description: 'Raw column', is_pii: false }))
      };
    }
  }
}
