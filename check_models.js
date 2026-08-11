import { GoogleGenAI } from '@google/genai';
import { config } from './src/config/env.js';

const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });

async function checkModels() {
  try {
    const list = await ai.models.list();
    console.log('Active Models for your key:');
    for await (const m of list) {
      if (m.name.includes('flash')) {
        console.log(` - ${m.name}`);
      }
    }
  } catch (err) {
    console.error('Failed to list models:', err);
  }
}

checkModels();