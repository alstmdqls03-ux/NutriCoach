import { describe, it, expect } from 'vitest';
import { translateToEnglish } from '@/lib/rag/translate';
import type { LLMProvider, LLMResponse } from '@/lib/llm/types';

function scripted(content: string): LLMProvider {
  return { chat: async (): Promise<LLMResponse> => ({ content, toolCalls: [], usage: { promptTokens: 1, completionTokens: 1 } }) };
}

describe('translateToEnglish', () => {
  it('returns the trimmed English query from the model', async () => {
    const out = await translateToEnglish(scripted('  weekly chest training volume  '), '가슴 볼륨 얼마나');
    expect(out).toBe('weekly chest training volume');
  });
  it('falls back to the original text when the model returns empty', async () => {
    const out = await translateToEnglish(scripted(''), '가슴 볼륨');
    expect(out).toBe('가슴 볼륨');
  });
});
