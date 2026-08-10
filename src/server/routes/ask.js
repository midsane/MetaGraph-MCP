import { Router } from 'express';
import { GoogleGenAI } from '@google/genai';
import { config } from '../../config/env.js';

// Import your MCP Tools
import { getGovernedSchemaTool } from "../../mcp/tools/get-governed-schema.js"
import { getLineageTool } from '../../mcp/tools/get-lineage.js';
import { searchMetadataTool } from '../../mcp/tools/search-metadata.js';

const router = Router();
const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

// 1. Map tool names to their execution functions
const toolsMap = {
    [getGovernedSchemaTool.name]: getGovernedSchemaTool,
    [getLineageTool.name]: getLineageTool,
    [searchMetadataTool.name]: searchMetadataTool
};

// 2. Convert MCP Input Schema format to Gemini Function Declarations
const geminiTools = [
    {
        functionDeclarations: Object.values(toolsMap).map(t => ({
            name: t.name,
            description: t.description,
            parameters: t.inputSchema
        }))
    }
];

/**
 * @openapi
 * /api/ask:
 *   post:
 *     summary: Agentic LLM endpoint that uses MCP tools to answer business queries
 */
router.post('/', async (req, res) => {
    try {
        const { query, userRole = 'ANALYST' } = req.body;
        if (!query) return res.status(400).json({ error: 'Query string is required' });

        console.log(`\n🤖 [Agent] Received Query: "${query}" (Role: ${userRole})`);

        // System instruction forcing Gemini to use tools
        const systemInstruction = `
      You are an Active Metadata AI Assistant for an enterprise data catalog.
      You have access to tools to search the business glossary, inspect table lineage, and fetch governed schemas.
      
      Always use 'search_business_glossary' first if you do not know the exact table names.
      If the user asks about PII or schema, call 'get_governed_schema' with userRole='${userRole}'.
      If the user asks about dependencies or upstream impact, call 'get_table_lineage'.
      
      Synthesize a concise, helpful answer based ONLY on the tool execution outputs.
    `;

        const contents = [{ role: 'user', parts: [{ text: query }] }];
        const toolTrace = [];
        let loopCount = 0;
        const MAX_LOOPS = 5;

        // Agentic Execution Loop
        while (loopCount < MAX_LOOPS) {
            console.log("\n----------------entered loop:", loopCount + 1, "----------------\n")
            loopCount++;

            const response = await ai.models.generateContent({
                model: 'gemini-3.5-flash',
                contents,
                config: {
                    systemInstruction,
                    tools: geminiTools
                }
            });

            console.log("response:", response)

            const candidate = response.candidates?.[0];
            const functionCalls = candidate?.content?.parts?.filter(p => p.functionCall).map(p => p.functionCall);

            console.log("function calls:", functionCalls)

            // If the LLM didn't request any tool calls, we have our final text answer!
            if (!functionCalls || functionCalls.length === 0) {
                const finalAnswer = response.text || "No response generated.";
                return res.json({
                    query,
                    answer: finalAnswer,
                    toolCallsExecuted: toolTrace
                });
            }

            // Append model's response (containing tool request) to context history
            contents.push(candidate.content);

            // Execute requested tools
            const toolResponseParts = [];

            for (const call of functionCalls) {
                const tool = toolsMap[call.name];
                if (!tool) {
                    console.error(`[Agent Error] Tool not found: ${call.name}`);
                    continue;
                }

                // Force userRole parameter if executing get_governed_schema
                const args = { ...call.args };
                if (call.name === 'get_governed_schema' && !args.userRole) {
                    args.userRole = userRole;
                }

                console.log(`⚙️ [Agent Call] Executing '${call.name}' with args:`, JSON.stringify(args));

                // Execute the MCP tool
                const result = await tool.execute(args);

                toolTrace.push({ tool: call.name, args, result: result.content[0].text });

                toolResponseParts.push({
                    functionResponse: {
                        name: call.name,
                        response: { result: result.content[0].text }
                    }
                });
            }

            // Append tool output back to context history for Gemini to read
            contents.push({
                role: 'user',
                parts: toolResponseParts
            });
        }

        res.status(500).json({ error: 'Agent tool execution loop exceeded max iterations.' });

    } catch (err) {
        console.error('[Ask Endpoint Error]', err);
        res.status(500).json({ error: err.message });
    }
});

export default router;