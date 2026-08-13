import { Router } from 'express';
import { runAgent } from '../../agent/runtime.js';

const router = Router();

/**
 * @openapi
 * /api/ask:
 *   post:
 *     summary: In-house AI agent runtime - accepts a natural language query and role, gives the
 *       model access to every catalog MCP tool (lineage, governed schema, semantic search,
 *       downstream impact, table discovery), and loops tool calls until it has a grounded answer.
 *       RBAC is enforced server-side on every tool call regardless of what the model requests.
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

        console.log(`\n⚡ [Agent Runtime] Processing query: "${query}" (Active Role: ${userRole})`);

        const result = await runAgent(query, userRole, { useHyde: true });

        return res.json({
            query: result.query,
            answer: result.answer,
            matchedTables: result.matchedTables,
            toolCalls: result.toolCalls,
            skillsLoaded: result.skillsLoaded,
            iterations: result.iterations,
        });
    } catch (err) {
        console.error('[Ask Endpoint Error]', err);
        const errorMessage = err instanceof Error ? err.message : 'Internal server error processing agent query.';
        res.status(500).json({ error: errorMessage });
    }
});

export default router;
