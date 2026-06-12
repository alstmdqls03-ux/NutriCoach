import { describe, it, expect } from 'vitest';
import { InMemoryLogRepository } from '../fakes/repositories';

describe('deleteLastLog', () => {
  it('removes the most recently inserted row for the user only', async () => {
    const repo = new InMemoryLogRepository();
    await repo.insertLog({ userId: 'u1', type: 'workout', data: { exercise: 'a' }, loggedAt: '2026-06-12T00:00:00Z' });
    await repo.insertLog({ userId: 'u1', type: 'sleep', data: { duration_min: 420 }, loggedAt: '2026-06-12T01:00:00Z' });
    await repo.insertLog({ userId: 'u2', type: 'workout', data: { exercise: 'b' }, loggedAt: '2026-06-12T02:00:00Z' });

    expect(await repo.deleteLastLog('u1')).toBe(true);
    const left = await repo.queryLogs({ userId: 'u1' });
    expect(left.map((r) => r.type)).toEqual(['workout']); // the sleep (last for u1) was removed
    expect((await repo.queryLogs({ userId: 'u2' })).length).toBe(1); // u2 untouched
  });

  it('returns false when the user has no logs', async () => {
    const repo = new InMemoryLogRepository();
    expect(await repo.deleteLastLog('nobody')).toBe(false);
  });
});
