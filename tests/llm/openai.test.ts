import { describe, it, expect, vi } from 'vitest';
import { OpenAIProvider } from '@/lib/llm/openai';

function fakeClient(response: unknown) {
  return { chat: { completions: { create: vi.fn().mockResolvedValue(response) } } };
}

describe('OpenAIProvider', () => {
  it('maps a tool call response into LLMResponse', async () => {
    const client = fakeClient({
      choices: [{ message: {
        content: null,
        tool_calls: [{ id: 'c1', type: 'function',
          function: { name: 'log_workout', arguments: '{"exercise":"bench","weight_kg":60}' } }],
      } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });
    const provider = new OpenAIProvider('gpt-4o-mini', client as never);
    const res = await provider.chat(
      [{ role: 'user', content: '벤치 60' }],
      [{ name: 'log_workout', description: 'x', parameters: { type: 'object' } }],
    );
    expect(res.toolCalls).toEqual([
      { id: 'c1', name: 'log_workout', arguments: { exercise: 'bench', weight_kg: 60 } },
    ]);
    expect(res.usage).toEqual({ promptTokens: 10, completionTokens: 5 });
  });

  it('maps a plain text response', async () => {
    const client = fakeClient({
      choices: [{ message: { content: '안녕하세요', tool_calls: undefined } }],
      usage: { prompt_tokens: 3, completion_tokens: 2 },
    });
    const provider = new OpenAIProvider('gpt-4o-mini', client as never);
    const res = await provider.chat([{ role: 'user', content: 'hi' }], []);
    expect(res.content).toBe('안녕하세요');
    expect(res.toolCalls).toEqual([]);
  });
});
