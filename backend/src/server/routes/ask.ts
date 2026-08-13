import { Router } from 'express';
import { GoogleGenAI } from '@google/genai';
import { vectorStore } from '../../storage/vector-store.js';
import { CatalogStore } from '../../storage/catalog-store.js';
import { LineageStore } from '../../storage/lineage-store.js';
import { config } from '../../config/env.js';

const router = Router();
const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

/**
 * @openapi
 * /api/ask:
 *   post:
 *     summary: Single-turn GraphRAG AI endpoint for natural language business queries
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               query:
 *                 type: string
 *               userRole:
 *                 type: string
 *                 example: ANALYST
 */
router.post('/', async (req, res) => {
    try {
        const { query, userRole = 'ANALYST' } = req.body;
        if (!query) {
            return res.status(400).json({ error: 'Query string is required' });
        }

        console.log(`\n⚡ [RAG Engine] Processing query: "${query}" (Active Role: ${userRole})`);

        // 1. Perform high-precision vector similarity search in Qdrant
        const matches = await vectorStore.searchSemantic(query, 3);
        console.log("matches:", matches)

        if (!matches || matches.length === 0) {
            return res.json({
                query,
                answer: "No matching tables or business metadata found in the catalog for your query.",
                matchedTables: []
            });
        }

        // 2. Hydrate columns (Postgres) + lineage (Neo4j) for each vector hit
        const hydratedMatches = await Promise.all(matches.map(async match => {
            const [rawColumns, upstream, downstream] = await Promise.all([
                match.tableId ? CatalogStore.getTableColumns(match.tableId) : Promise.resolve([]),
                LineageStore.getUpstream(match.tableName),
                LineageStore.getDownstream(match.tableName),
            ]);

            return {
                tableName: match.tableName,
                business_description: match.business_description,
                columns: rawColumns.map(col => ({
                    name: col.column_name,
                    description: col.pii_reason || '',
                    is_pii: col.is_pii,
                })),
                upstream_dependencies: upstream,
                downstream_dependents: downstream,
            };
        }));

        // 3. Build context blocks & enforce programmatic RBAC PII redaction (Zero LLM Overhead)
        const contextBlocks = hydratedMatches.map(match => {
            let columns = match.columns || [];

            // Enforce PII Masking Policy for non-ADMIN users
            if (userRole !== 'ADMIN') {
                columns = columns.map(col => {
                    if (col.is_pii) {
                        return {
                            ...col,
                            name: `[REDACTED_PII_${col.name.toUpperCase()}]`,
                            description: `ACCESS DENIED: Column masked due to ${userRole} role policies.`
                        };
                    }
                    return col;
                });
            }

            const columnListFormatted = columns
                .map(c => `  - ${c.name}: ${c.description} ${c.is_pii ? '(PII)' : ''}`)
                .join('\n');

            const upstream = match.upstream_dependencies?.length
                ? match.upstream_dependencies.join(', ')
                : 'None';

            const downstream = match.downstream_dependents?.length
                ? match.downstream_dependents.join(', ')
                : 'None';

            return `
---
TABLE NAME: ${match.tableName}
BUSINESS DESCRIPTION: ${match.business_description}
UPSTREAM LINEAGE (Parents): ${upstream}
DOWNSTREAM LINEAGE (Impacted Tables): ${downstream}
COLUMNS:
${columnListFormatted || '  - No explicit columns documented.'}
---`;
        }).join('\n');

        // 3. Define System Instruction for single-turn synthesis
        const systemInstruction = `
        You are MetaGraph, an enterprise Data Catalog & Governance AI Assistant.
        Your job is to answer business questions about data schemas, PII policies, and table lineage.

        STRICT ANSWERING RULES:
        1. Base your answer ONLY on the provided DATABASE METADATA CATALOG CONTEXT below.
        2. Clearly state which table names and column names contain the relevant data.
        3. If any columns show '[REDACTED_PII...]', explicitly remind the user that access is masked under their current '${userRole}' role policies.
        4. If the user asks about data lineage or impact analysis, explain the upstream source dependencies or downstream impacted tables.
        5. Never fabricate table names, column names, or relationships that are not present in the context.
        `;

        const prompt = `
        DATABASE METADATA CATALOG CONTEXT:
        ${contextBlocks}

        USER QUESTION: "${query}"
        `;

        console.log('invoking llm')
        // 4. Execute single-turn LLM generation
        const response = await ai.models.generateContent({
            model: 'gemini-flash-latest',
            contents: prompt,
            config: { systemInstruction }
        });

        return res.json({
            query,
            answer: response.text || "Unable to generate an answer from the retrieved metadata context.",
            matchedTables: matches.map(m => m.tableName)
        });

    } catch (err) {
        console.error('[Ask Endpoint Error]', err);
        const errorMessage = err instanceof Error ? err.message : 'Internal server error processing RAG search.';
        res.status(500).json({ error: errorMessage });
    }
});

export default router;