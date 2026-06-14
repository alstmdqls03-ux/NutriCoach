import { describe, it, expect } from 'vitest';
import { buildCoachResponse } from '@/lib/coach';
import type { ExerciseRecord } from '@/lib/coach/types';
import type { LogRow } from '@/lib/repositories/types';

const dataset: ExerciseRecord[] = [
  { id: 'Machine_Bench_Press', name: 'Machine Bench Press', primaryMuscles: ['chest'], secondaryMuscles: [], equipment: 'machine', bodyPart: 'upper' },
];
const aliases = { '체스트프레스': 'Machine_Bench_Press' };

describe('buildCoachResponse', () => {
  it('surfaces unmapped machines as misses, never drops them silently', () => {
    const res = buildCoachResponse(
      { machines: ['체스트프레스', '우주머신'], targetMuscle: '가슴', experience: 'beginner' },
      [], dataset, aliases,
    );
    expect(res.misses).toEqual([{ input: '우주머신' }]);
    expect(res.routine.exercises.map((e) => e.exerciseId)).toEqual(['Machine_Bench_Press']);
  });

  it('computes a progressed prescription from history', () => {
    const logs: LogRow[] = [
      { id: 'a', type: 'workout', logged_at: '2026-06-12T10:00:00Z',
        data: { exercise: '체스트프레스', weight_kg: 40, reps: 12, sets: 3 } },
    ];
    const res = buildCoachResponse(
      { machines: ['체스트프레스'], targetMuscle: '가슴', experience: 'beginner' },
      logs, dataset, aliases,
    );
    const p = res.progression.prescriptions[0];
    expect(p.exerciseId).toBe('Machine_Bench_Press');
    expect(p.weight_kg).toBe(42.5);
    expect(p.basis).toBe('progressed');
  });

  it('uses cold-start when an exercise has no history', () => {
    const res = buildCoachResponse(
      { machines: ['체스트프레스'], targetMuscle: '가슴', experience: 'beginner' },
      [], dataset, aliases,
    );
    expect(res.progression.prescriptions[0].basis).toBe('cold-start');
    expect(res.progression.prescriptions[0].weight_kg).toBeNull();
  });

  it('ships explanations empty in Plan 1', () => {
    const res = buildCoachResponse(
      { machines: ['체스트프레스'], targetMuscle: '가슴', experience: 'beginner' },
      [], dataset, aliases,
    );
    expect(res.explanations).toEqual([]);
  });
});
