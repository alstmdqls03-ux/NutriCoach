import { describe, it, expect } from 'vitest';
import { MACHINE_CATALOG, machineImageUrl, catalogByBodyPart } from '@/lib/coach/catalog';
import { resolveMachine } from '@/lib/coach/machineMap';
import { loadExercises } from '@/lib/coach/exercises';

describe('MACHINE_CATALOG', () => {
  it('every label resolves to an exercise via the alias map', () => {
    for (const m of MACHINE_CATALOG) {
      expect(resolveMachine(m.label), `${m.label} should map`).toBe(m.id);
    }
  });

  it('every id exists in the dataset', () => {
    const ids = new Set(loadExercises().map((e) => e.id));
    for (const m of MACHINE_CATALOG) expect(ids.has(m.id), `${m.id} in dataset`).toBe(true);
  });

  it('builds a github raw image url', () => {
    expect(machineImageUrl('Leg_Press')).toBe('https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/Leg_Press/0.jpg');
  });

  it('groups by body part preserving order', () => {
    const groups = catalogByBodyPart();
    expect(groups[0].bodyPart).toBe('가슴');
    expect(groups.flatMap((g) => g.machines).length).toBe(MACHINE_CATALOG.length);
  });
});
