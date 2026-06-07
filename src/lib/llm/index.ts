import OpenAI from 'openai';
import type { LLMProvider } from './types';
import { OpenAIProvider } from './openai';

export function getLLM(): LLMProvider {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  return new OpenAIProvider(process.env.OPENAI_MODEL ?? 'gpt-4o-mini', client);
}
