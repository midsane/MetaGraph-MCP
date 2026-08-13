import { GoogleGenAI } from '@google/genai';
import { config } from '../config/env.js';

const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
const MODEL = 'gemini-flash-latest';

/**
 * HyDE (Hypothetical Document Embeddings): drafts a short hypothetical
 * catalog business-description that would plausibly answer the query, then
 * that prose (rather than the terse user question) gets embedded for the
 * Qdrant search. Indexed vectors are themselves hydrated descriptions, so a
 * hypothetical description tends to sit closer to them in embedding space
 * than a raw question does. Bounded and best-effort: any failure or empty
 * output falls back to the caller using the raw query untouched.
 */
export async function generateHydeDocument(query: string): Promise<string | null> {
  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents:
        `Write a short (2-3 sentence) hypothetical data-catalog business description of the ` +
        `database table that would best answer the question below. Describe a plausible table ` +
        `and its columns/purpose - do not answer the question itself, and do not mention that it ` +
        `is hypothetical.\n\nQuestion: "${query}"`,
      config: { maxOutputTokens: 120, temperature: 0.2 },
    });

    const text = response.text?.trim();
    return text ? text : null;
  } catch (err) {
    console.error('[HyDE] generation failed, falling back to raw query:', err instanceof Error ? err.message : err);
    return null;
  }
}
