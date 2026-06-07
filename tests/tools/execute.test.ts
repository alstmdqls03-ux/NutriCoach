import { describe, it, expect } from 'vitest';
import { executeTool } from '@/lib/tools/execute';
import { InMemoryLogRepository } from '../fakes/repositories';

describe('executeTool', () => {
  it('log_workout inserts a workout row and returns confirmation', async () => {
    const repo = new InMemoryLogRepository();
    const out = await executeTool(
      { id: 'c1', name: 'log_workout',
        arguments: { exercise: '벤치프레스', weight_kg: 60, reps: 8, sets: 3 } },
      repo, 'u1', '2026-06-08T10:00:00.000Z',
    );
    expect(repo.rows).toHaveLength(1);
    expect(repo.rows[0].type).toBe('workout');
    expect(repo.rows[0].data).toMatchObject({ exercise: '벤치프레스', weight_kg: 60, reps: 8, sets: 3 });
    expect(out).toContain('기록');
  });

  it('query_logs returns the user rows as JSON', async () => {
    const repo = new InMemoryLogRepository();
    await repo.insertLog({ userId: 'u1', type: 'workout',
      data: { exercise: 'squat', weight_kg: 100, reps: 5, sets: 5 }, loggedAt: '2026-06-07T10:00:00.000Z' });
    const out = await executeTool(
      { id: 'c2', name: 'query_logs', arguments: { type: 'workout' } },
      repo, 'u1', '2026-06-08T10:00:00.000Z',
    );
    expect(out).toContain('squat');
  });

  it('rejects an unknown tool', async () => {
    const repo = new InMemoryLogRepository();
    await expect(
      executeTool({ id: 'c3', name: 'nope', arguments: {} }, repo, 'u1', '2026-06-08T10:00:00.000Z'),
    ).rejects.toThrow(/unknown tool/i);
  });
});
