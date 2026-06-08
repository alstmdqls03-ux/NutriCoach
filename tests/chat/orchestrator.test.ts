import { describe, it, expect } from 'vitest';
import { runChat } from '@/lib/chat/orchestrator';
import { ScriptedLLMProvider } from '../fakes/llm';
import { InMemoryLogRepository, InMemoryMessageRepository, FakeProfileRepository } from '../fakes/repositories';

const NOW = '2026-06-08T10:00:00.000Z';

function deps() {
  return {
    logs: new InMemoryLogRepository(),
    msgs: new InMemoryMessageRepository(),
    prof: new FakeProfileRepository(),
  };
}

describe('runChat', () => {
  it('executes a tool call then returns the final assistant text', async () => {
    const d = deps();
    const llm = new ScriptedLLMProvider([
      { content: null, usage: { promptTokens: 10, completionTokens: 4 },
        toolCalls: [{ id: 't1', name: 'log_workout',
          arguments: { exercise: '벤치프레스', weight_kg: 60, reps: 8, sets: 3 } }] },
      { content: '벤치 60kg 8회 3세트 기록했어요!', toolCalls: [], usage: { promptTokens: 12, completionTokens: 6 } },
    ]);
    const res = await runChat({
      userId: 'u1', userMessage: '벤치 60 8회 3세트 했어', llm,
      logs: d.logs, msgs: d.msgs, prof: d.prof, now: NOW, maxToolRounds: 2, contextLimit: 20,
    });
    expect(d.logs.rows).toHaveLength(1);
    expect(res.reply).toContain('기록');
    expect(res.usage.promptTokens).toBe(22); // summed across rounds
    // persisted: user + assistant(tool_calls) + tool + assistant(final) = 4
    expect(await d.msgs.countMessages('u1')).toBe(4);
  });

  it('passes through a confirm-back question without calling a tool', async () => {
    const d = deps();
    const llm = new ScriptedLLMProvider([
      { content: '벤치 60kg 8회 3세트로 기록할까요?', toolCalls: [], usage: { promptTokens: 8, completionTokens: 5 } },
    ]);
    const res = await runChat({
      userId: 'u1', userMessage: '벤치 60', llm,
      logs: d.logs, msgs: d.msgs, prof: d.prof, now: NOW, maxToolRounds: 2, contextLimit: 20,
    });
    expect(d.logs.rows).toHaveLength(0);
    expect(res.reply).toContain('기록할까요');
  });

  it('injects the safety disclaimer when the user reports pain', async () => {
    const d = deps();
    const llm = new ScriptedLLMProvider([
      { content: '오늘은 가볍게 쉬어요.', toolCalls: [], usage: { promptTokens: 7, completionTokens: 4 } },
    ]);
    const res = await runChat({
      userId: 'u1', userMessage: '어깨가 아파', llm,
      logs: d.logs, msgs: d.msgs, prof: d.prof, now: NOW, maxToolRounds: 2, contextLimit: 20,
    });
    expect(res.reply).toContain('전문가');
  });

  it('retries the LLM once on transient failure (spec §4)', async () => {
    const d = deps();
    let calls = 0;
    const flaky = {
      async chat() {
        calls++;
        if (calls === 1) throw new Error('transient 503');
        return { content: '다시 시도해서 답했어요.', toolCalls: [], usage: { promptTokens: 5, completionTokens: 3 } };
      },
    };
    const res = await runChat({
      userId: 'u1', userMessage: '안녕', llm: flaky as never,
      logs: d.logs, msgs: d.msgs, prof: d.prof, now: NOW, maxToolRounds: 2, contextLimit: 20,
    });
    expect(calls).toBe(2);
    expect(res.reply).toContain('답했어요');
  });

  it('does not replay raw tool / tool_call messages on a later turn', async () => {
    const d = deps();
    const llm = new ScriptedLLMProvider([
      // turn 1: model logs a workout, then replies
      { content: null, usage: { promptTokens: 1, completionTokens: 1 },
        toolCalls: [{ id: 't1', name: 'log_workout',
          arguments: { exercise: '벤치', weight_kg: 60, reps: 8, sets: 3 } }] },
      { content: '기록했어요', toolCalls: [], usage: { promptTokens: 1, completionTokens: 1 } },
      // turn 2: model just replies with text
      { content: '이번 주 좋았어요', toolCalls: [], usage: { promptTokens: 1, completionTokens: 1 } },
    ]);
    const base = { logs: d.logs, msgs: d.msgs, prof: d.prof, now: NOW, maxToolRounds: 2, contextLimit: 20 };
    await runChat({ userId: 'u1', userMessage: '벤치 60 8회 3세트', llm, ...base });
    await runChat({ userId: 'u1', userMessage: '이번 주 어땠어?', llm, ...base });
    const lastCall = llm.calls[llm.calls.length - 1];
    expect(lastCall.messages.some((m) => m.role === 'tool')).toBe(false);
    expect(lastCall.messages.some((m) => m.role === 'assistant' && m.toolCalls)).toBe(false);
    // sanity: the earlier user message is still replayed (content preserved)
    expect(lastCall.messages.some((m) => m.role === 'user' && m.content?.includes('벤치 60 8회 3세트'))).toBe(true);
  });

  it('marks historical user turns as already-recorded so the model never re-logs them', async () => {
    const d = deps();
    const llm = new ScriptedLLMProvider([
      // turn 1: log a workout, then reply
      { content: null, usage: { promptTokens: 1, completionTokens: 1 },
        toolCalls: [{ id: 't1', name: 'log_workout',
          arguments: { exercise: '스쿼트', weight_kg: 80, reps: 5, sets: 5 } }] },
      { content: '기록했어요', toolCalls: [], usage: { promptTokens: 1, completionTokens: 1 } },
      // turn 2: log a different workout, then reply
      { content: null, usage: { promptTokens: 1, completionTokens: 1 },
        toolCalls: [{ id: 't2', name: 'log_workout',
          arguments: { exercise: '런지', reps: 12, sets: 3, weight_kg: 0 } }] },
      { content: '기록했어요', toolCalls: [], usage: { promptTokens: 1, completionTokens: 1 } },
    ]);
    const base = { logs: d.logs, msgs: d.msgs, prof: d.prof, now: NOW, maxToolRounds: 2, contextLimit: 20 };
    await runChat({ userId: 'u1', userMessage: '오늘 스쿼트 80kg 5회 5세트 했어', llm, ...base });
    await runChat({ userId: 'u1', userMessage: '오늘 런지 12회 3세트 했어', llm, ...base });

    const turn2 = llm.calls[llm.calls.length - 1].messages;
    const userTurns = turn2.filter((m) => m.role === 'user');
    // The prior workout message must be marked as already-recorded context...
    expect(userTurns.some((m) => m.content?.startsWith('[지난 대화') && m.content.includes('스쿼트'))).toBe(true);
    // ...while the current message stays a clean, unmarked instruction.
    expect(userTurns.some((m) => m.content === '오늘 런지 12회 3세트 했어')).toBe(true);
    expect(userTurns.some((m) => m.content === '오늘 스쿼트 80kg 5회 5세트 했어')).toBe(false);
  });
});
