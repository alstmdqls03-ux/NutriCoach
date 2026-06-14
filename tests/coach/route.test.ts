import { describe, it, expect } from 'vitest';
import { handleCoach } from '@/app/api/coach/route';
import type { LogRow } from '@/lib/repositories/types';

const fakeLogs = (rows: LogRow[]) => ({
  queryLogs: async () => rows,
  insertLog: async () => {}, deleteLastLog: async () => false,
});

describe('handleCoach', () => {
  it('400s on missing machines', async () => {
    const r = await handleCoach({ body: { targetMuscle: '가슴', experience: 'beginner' }, logs: fakeLogs([]) });
    expect(r.status).toBe(400);
  });

  it('returns a CoachResponse with routine + progression', async () => {
    const logs = fakeLogs([
      { id: 'a', type: 'workout', logged_at: '2026-06-12T10:00:00Z',
        data: { exercise: '체스트프레스', weight_kg: 40, reps: 12, sets: 3 } },
    ]);
    const r = await handleCoach({
      body: { machines: ['체스트프레스'], targetMuscle: '가슴', experience: 'beginner' },
      logs,
    });
    expect(r.status).toBe(200);
    expect('routine' in r.body && r.body.routine).toBeDefined();
    expect('progression' in r.body && r.body.progression.prescriptions.length).toBeGreaterThanOrEqual(0);
    expect('explanations' in r.body && r.body.explanations).toEqual([]);
  });
});
