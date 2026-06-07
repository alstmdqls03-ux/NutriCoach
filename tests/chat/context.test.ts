import { describe, it, expect } from 'vitest';
import { loadContext, shouldCompress, compressOldMessages } from '@/lib/chat/context';
import { InMemoryMessageRepository, FakeProfileRepository } from '../fakes/repositories';

describe('context', () => {
  it('loadContext returns recent messages + summary', async () => {
    const msgs = new InMemoryMessageRepository();
    const prof = new FakeProfileRepository();
    await prof.setRollingSummary('u1', '지난주 벤치 위주 운동');
    await msgs.insertMessage('u1', { role: 'user', content: 'hi', tool_calls: null });
    const ctx = await loadContext(msgs, prof, 'u1', 20);
    expect(ctx.summary).toBe('지난주 벤치 위주 운동');
    expect(ctx.messages).toHaveLength(1);
  });

  it('shouldCompress is true only above the limit', () => {
    expect(shouldCompress(21, 20)).toBe(true);
    expect(shouldCompress(20, 20)).toBe(false);
  });

  it('compressOldMessages folds oldest into summary and deletes them', async () => {
    const msgs = new InMemoryMessageRepository();
    const prof = new FakeProfileRepository();
    for (let i = 0; i < 5; i++) {
      await msgs.insertMessage('u1', { role: 'user', content: `m${i}`, tool_calls: null });
    }
    await compressOldMessages(msgs, prof, 'u1', 2, (text) => `SUMMARY(${text.length})`);
    expect(await prof.getRollingSummary('u1')).toMatch(/^SUMMARY\(/);
    expect(await msgs.countMessages('u1')).toBe(3); // 5 - 2 deleted
  });
});
