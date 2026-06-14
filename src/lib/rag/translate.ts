import type { LLMProvider } from '@/lib/llm/types';

/** Translate a Korean fitness question to a concise English search query. */
export async function translateToEnglish(llm: LLMProvider, korean: string): Promise<string> {
  const res = await llm.chat([
    { role: 'system', content: 'Translate the user\'s Korean fitness question into a concise English search query. Output ONLY the English query, no quotes or extra words.' },
    { role: 'user', content: korean },
  ], []);
  const out = (res.content ?? '').trim();
  return out || korean;
}
