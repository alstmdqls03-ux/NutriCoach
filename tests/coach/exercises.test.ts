import { describe, it, expect } from 'vitest';
import { toExerciseRecord, loadExercises, getExerciseById } from '@/lib/coach/exercises';

describe('exercise loader', () => {
  it('classifies a leg movement as lower body', () => {
    const rec = toExerciseRecord({
      id: 'Leg_Press', name: 'Leg Press',
      primaryMuscles: ['quadriceps'], secondaryMuscles: ['glutes'], equipment: 'machine',
    });
    expect(rec.bodyPart).toBe('lower');
  });

  it('classifies a chest movement as upper body', () => {
    const rec = toExerciseRecord({
      id: 'Pec_Deck', name: 'Pec Deck',
      primaryMuscles: ['chest'], secondaryMuscles: [], equipment: 'machine',
    });
    expect(rec.bodyPart).toBe('upper');
  });

  it('tolerates missing arrays/equipment', () => {
    const rec = toExerciseRecord({ id: 'X', name: 'X' } as never);
    expect(rec.primaryMuscles).toEqual([]);
    expect(rec.equipment).toBeNull();
    expect(rec.bodyPart).toBe('upper'); // default when unknown
  });

  it('loads the vendored dataset and finds by id', () => {
    const all = loadExercises();
    expect(all.length).toBeGreaterThan(100);
    const byId = getExerciseById(all, all[0].id);
    expect(byId?.id).toBe(all[0].id);
  });
});
