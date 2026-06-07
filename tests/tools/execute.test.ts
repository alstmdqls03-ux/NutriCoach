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

  it('log_workout back-dates to occurred_at when the user states a past date', async () => {
    const repo = new InMemoryLogRepository();
    await executeTool(
      { id: 'w2', name: 'log_workout',
        arguments: { exercise: '스쿼트', weight_kg: 90, reps: 5, sets: 5, occurred_at: '2026-06-05T18:00:00.000Z' } },
      repo, 'u1', '2026-06-08T10:00:00.000Z',
    );
    expect(repo.rows[0].logged_at).toBe('2026-06-05T18:00:00.000Z'); // not "now"
  });

  it('log_workout falls back to now when occurred_at is absent', async () => {
    const repo = new InMemoryLogRepository();
    const NOW = '2026-06-08T10:00:00.000Z';
    await executeTool(
      { id: 'w3', name: 'log_workout', arguments: { exercise: '벤치', weight_kg: 60, reps: 8, sets: 3 } },
      repo, 'u1', NOW,
    );
    expect(repo.rows[0].logged_at).toBe(NOW);
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

  it('log_sleep falls back to now when bed_time is not a valid timestamp', async () => {
    const repo = new InMemoryLogRepository();
    const NOW = '2026-06-08T10:00:00.000Z';
    await executeTool(
      { id: 's1', name: 'log_sleep', arguments: { wake_time: '07:00', duration_min: 420 } },
      repo, 'u1', NOW,
    );
    expect(repo.rows).toHaveLength(1);
    expect(repo.rows[0].type).toBe('sleep');
    expect(repo.rows[0].logged_at).toBe(NOW); // no bed_time -> fallback to now, never NaN/null
    expect(repo.rows[0].data).toMatchObject({ duration_min: 420 });
  });

  it('log_sleep uses bed_time when it is a valid ISO timestamp', async () => {
    const repo = new InMemoryLogRepository();
    await executeTool(
      { id: 's2', name: 'log_sleep',
        arguments: { bed_time: '2026-06-07T23:00:00.000Z', wake_time: '2026-06-08T07:00:00.000Z' } },
      repo, 'u1', '2026-06-08T10:00:00.000Z',
    );
    expect(repo.rows[0].logged_at).toBe('2026-06-07T23:00:00.000Z');
  });

  it('rejects an unknown tool', async () => {
    const repo = new InMemoryLogRepository();
    await expect(
      executeTool({ id: 'c3', name: 'nope', arguments: {} }, repo, 'u1', '2026-06-08T10:00:00.000Z'),
    ).rejects.toThrow(/unknown tool/i);
  });
});
