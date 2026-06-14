import type { ComputedRoutine, ExerciseRecord, Experience, RoutineExercise } from './types';
import { resolveTargetMuscle } from './muscles';

const DEFAULT_REP_RANGE: [number, number] = [8, 12];
const SETS_BY_EXPERIENCE: Record<Experience, number> = { beginner: 3, intermediate: 4, advanced: 4 };

export interface BuildRoutineOptions {
  machineIds: string[];     // resolved exercise ids the user actually has
  targetMuscle: string;     // Korean term
  experience: Experience;
}

export function buildRoutine(opts: BuildRoutineOptions, dataset: ExerciseRecord[]): ComputedRoutine {
  const wanted = new Set(opts.machineIds);
  const muscles = new Set(resolveTargetMuscle(opts.targetMuscle));
  const sets = SETS_BY_EXPERIENCE[opts.experience];

  const exercises: RoutineExercise[] = dataset
    .filter((e) => wanted.has(e.id))
    .filter((e) => muscles.size === 0 || e.primaryMuscles.some((m) => muscles.has(m)))
    .map((e) => ({ exerciseId: e.id, name: e.name, sets, repRange: DEFAULT_REP_RANGE }));

  return { targetMuscle: opts.targetMuscle, exercises };
}
