import { Router } from 'express';
import { runAgent } from '../../agent/runtime.js';
import { loadSession, saveSession } from '../../agent/session-store.js';
import { normalizeRole } from '../../rbac/redact.js';
import { config } from '../../config/env.js';

const router = Router();

/**
 * @openapi
 * /api/ask:
 *   post:
 *     summary: In-house AI agent runtime - accepts a natural language query, role, and optional
 *       sessionId, gives the model access to every catalog MCP tool (lineage, governed schema,
 *       semantic search, downstream impact, table discovery), and loops tool calls until it has a
 *       grounded answer. Conversation history is kept server-side per sessionId so follow-up
 *       messages ("yes, go ahead") continue the same reasoning context. RBAC is enforced
 *       server-side on every tool call regardless of what the model requests, and history is
 *       reset whenever role or the active LLM provider changes mid-session.
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
 *               sessionId:
 *                 type: string
 *                 description: Omit to start a new conversation; echo back the sessionId from a prior response to continue it.
 */
router.post('/', async (req, res) => {
    try {
        const { query, userRole = 'ANALYST', sessionId: incomingSessionId } = req.body;
        if (!query) {
            return res.status(400).json({ error: 'Query string is required' });
        }

        const role = normalizeRole(userRole);
        const { sessionId, history, wasReset } = loadSession(incomingSessionId, role, config.llmProvider);

        console.log(`\n⚡ [Agent Runtime] session=${sessionId} query="${query}" (Active Role: ${role})`);

        const result = await runAgent(query, role, { useHyde: true, history });

        saveSession(sessionId, result.history, role, config.llmProvider);

        return res.json({
            sessionId,
            wasReset,
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
