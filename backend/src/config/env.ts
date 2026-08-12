import dotenv from 'dotenv';
// Suppress stdout logs so MCP JSON-RPC protocol stream is never corrupted
dotenv.config({ quiet: true });

export const config = {
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
};

