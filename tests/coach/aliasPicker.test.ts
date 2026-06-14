import { describe, it, expect } from 'vitest';
import { candidateMachineExercises } from '@/lib/coach/aliasPicker';
import type { ExerciseRecord } from '@/lib/coach/types';

const dataset: ExerciseRecord[] = [
  { id: 'Butterfly', name: 'Butterfly', primaryMuscles: ['chest'], secondaryMuscles: [], equipment: 'machine', bodyPart: 'upper' },
  { id: 'Cable_Chest_Press', name: 'Cable Chest Press', primaryMuscles: ['chest'], secondaryMuscles: [], equipment: 'cable', bodyPart: 'upper' },
  { id: 'Dumbbell_Flyes', name: 'Dumbbell Flyes', primaryMuscles: ['chest'], secondaryMuscles: [], equipment: 'dumbbell', bodyPart: 'upper' },
  { id: 'Leg_Press', name: 'Leg Press', primaryMuscles: ['quadriceps'], secondaryMuscles: [], equipment: 'machine', bodyPart: 'lower' },
];

describe('candidateMachineExercises', () => {
  it('returns machine/cable exercises for the muscle, excluding free weights', () => {
    const r = candidateMachineExercises('가슴', dataset);
    expect(r.map((e) => e.id)).toEqual(['Butterfly', 'Cable_Chest_Press']);
  });
  it('returns {id,name} pairs only', () => {
    const r = candidateMachineExercises('가슴', dataset);
    expect(r[0]).toEqual({ id: 'Butterfly', name: 'Butterfly' });
  });
  it('excludes other muscle groups', () => {
    const r = candidateMachineExercises('가슴', dataset);
    expect(r.find((e) => e.id === 'Leg_Press')).toBeUndefined();
  });
  it('returns [] for an unknown muscle term', () => {
    expect(candidateMachineExercises('우주', dataset)).toEqual([]);
  });
});
