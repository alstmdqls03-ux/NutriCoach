import { describe, it, expect } from 'vitest';
import { buildRoutine } from '@/lib/coach/routine';
import type { ExerciseRecord } from '@/lib/coach/types';

const dataset: ExerciseRecord[] = [
  { id: 'Pec_Deck', name: 'Pec Deck', primaryMuscles: ['chest'], secondaryMuscles: [], equipment: 'machine', bodyPart: 'upper' },
  { id: 'Lat_Pulldown', name: 'Lat Pulldown', primaryMuscles: ['lats'], secondaryMuscles: ['biceps'], equipment: 'cable', bodyPart: 'upper' },
  { id: 'Leg_Press', name: 'Leg Press', primaryMuscles: ['quadriceps'], secondaryMuscles: ['glutes'], equipment: 'machine', bodyPart: 'lower' },
];

describe('buildRoutine', () => {
  it('includes only exercises whose id is in the machine list', () => {
    const r = buildRoutine({ machineIds: ['Pec_Deck'], targetMuscle: '가슴', experience: 'beginner' }, dataset);
    expect(r.exercises.map((e) => e.exerciseId)).toEqual(['Pec_Deck']);
  });

  it('filters by target muscle (등 excludes chest/legs)', () => {
    const r = buildRoutine({ machineIds: ['Pec_Deck', 'Lat_Pulldown', 'Leg_Press'], targetMuscle: '등', experience: 'beginner' }, dataset);
    expect(r.exercises.map((e) => e.exerciseId)).toEqual(['Lat_Pulldown']);
  });

  it('never includes a machine outside the list (core invariant)', () => {
    const r = buildRoutine({ machineIds: ['Lat_Pulldown'], targetMuscle: '하체', experience: 'beginner' }, dataset);
    // 하체 matches Leg_Press, but Leg_Press is not in the machine list -> empty
    expect(r.exercises).toEqual([]);
  });

  it('sets the default rep range and experience-based set count', () => {
    const r = buildRoutine({ machineIds: ['Pec_Deck'], targetMuscle: '가슴', experience: 'intermediate' }, dataset);
    expect(r.exercises[0].repRange).toEqual([8, 12]);
    expect(r.exercises[0].sets).toBe(4); // intermediate
  });
});
