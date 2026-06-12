import { describe, it, expect } from 'vitest';
import { summarizeExercises, lastSessionEntries } from '@/lib/log/history';
import type { LogRow } from '@/lib/repositories/types';

// queryLogs returns newest-first; mirror that ordering here.
const rows: LogRow[] = [
  { id: '4', type: 'workout', data: { exercise: '벤치 프레스', weight_kg: 65, reps: 8, sets: 3 }, logged_at: '2026-06-12T01:00:00Z' },
  { id: '3', type: 'workout', data: { exercise: '스쿼트', weight_kg: 80, reps: 5, sets: 5 }, logged_at: '2026-06-12T00:30:00Z' },
  { id: '2', type: 'sleep', data: { duration_min: 420 }, logged_at: '2026-06-11T20:00:00Z' },
  { id: '1', type: 'workout', data: { exercise: '벤치프레스', weight_kg: 60, reps: 8, sets: 3 }, logged_at: '2026-06-09T01:00:00Z' },
];

describe('workout history', () => {
  it('summarizes exercises recency-first with last values, folding name variants', () => {
    const ex = summarizeExercises(rows);
    expect(ex.map((e) => e.name)).toEqual(['벤치 프레스', '스쿼트']); // 벤치프레스 folds into 벤치 프레스
    expect(ex[0]).toMatchObject({ weight_kg: 65, reps: 8, sets: 3, count: 2 });
    expect(ex[1]).toMatchObject({ weight_kg: 80, count: 1 });
  });

  it('clones the most recent calendar-day session (excludes sleep + older days)', () => {
    const last = lastSessionEntries(rows);
    expect(last.map((e) => e.exercise)).toEqual(['벤치 프레스', '스쿼트']);
    expect(last.every((e) => 'weight_kg' in e)).toBe(true);
  });

  it('returns empty arrays when there is no workout history', () => {
    expect(summarizeExercises([])).toEqual([]);
    expect(lastSessionEntries([])).toEqual([]);
  });
});
