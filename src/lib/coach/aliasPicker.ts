import type { ExerciseRecord } from './types';
import { resolveTargetMuscle } from './muscles';

const PICKABLE_EQUIPMENT = new Set(['machine', 'cable']);

export interface ExerciseChoice { id: string; name: string; }

/** Machine/cable exercises whose primary muscle matches the Korean term. */
export function candidateMachineExercises(muscle: string, dataset: ExerciseRecord[]): ExerciseChoice[] {
  const muscles = new Set(resolveTargetMuscle(muscle));
  if (muscles.size === 0) return [];
  return dataset
    .filter((e) => e.equipment != null && PICKABLE_EQUIPMENT.has(e.equipment))
    .filter((e) => e.primaryMuscles.some((m) => muscles.has(m)))
    .map((e) => ({ id: e.id, name: e.name }));
}
