import { getLlmProvider } from '../llm/index.js';

/**
 * HyDE (Hypothetical Document Embeddings): drafts a short hypothetical
 * catalog business-description that would plausibly answer the query, then
 * that prose (rather than the terse user question) gets embedded for the
 * Qdrant search. Indexed vectors are themselves hydrated descriptions, so a
 * hypothetical description tends to sit closer to them in embedding space
 * than a raw question does. Bounded and best-effort: any failure or empty
 * output falls back to the caller using the raw query untouched. Routes
 * through whichever provider LLM_PROVIDER selects.
 */
export async function generateHydeDocument(query: string): Promise<string | null> {
  try {
    const result = await getLlmProvider().chat({
      system: 'You draft short hypothetical data-catalog business descriptions. Never answer the question itself.',
      messages: [
        {
          role: 'user',
          content:
            `Write a short (2-3 sentence) hypothetical data-catalog business description of the ` +
            `database table that would best answer the question below. Describe a plausible table ` +
            `and its columns/purpose - do not answer the question itself, and do not mention that it ` +
            `is hypothetical.\n\nQuestion: "${query}"`,
        },
      ],
      maxOutputTokens: 120,
      temperature: 0.2,
    });

    const text = result.text?.trim();
    return text ? text : null;
  } catch (err) {
    console.error('[HyDE] generation failed, falling back to raw query:', err instanceof Error ? err.message : err);
    return null;
  }
}
