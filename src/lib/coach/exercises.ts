import type { BodyPart, ExerciseRecord } from './types';
import raw from './data/free-exercise-db.json';

const LOWER_MUSCLES = new Set([
  'quadriceps', 'hamstrings', 'glutes', 'calves', 'abductors', 'adductors',
]);

interface RawExercise {
  id: string;
  name: string;
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
  equipment?: string | null;
}

function classifyBodyPart(primaryMuscles: string[]): BodyPart {
  return primaryMuscles.some((m) => LOWER_MUSCLES.has(m)) ? 'lower' : 'upper';
}

export function toExerciseRecord(r: RawExercise): ExerciseRecord {
  const primaryMuscles = Array.isArray(r.primaryMuscles) ? r.primaryMuscles : [];
  const secondaryMuscles = Array.isArray(r.secondaryMuscles) ? r.secondaryMuscles : [];
  return {
    id: r.id,
    name: r.name,
    primaryMuscles,
    secondaryMuscles,
    equipment: r.equipment ?? null,
    bodyPart: classifyBodyPart(primaryMuscles),
  };
}

let cache: ExerciseRecord[] | null = null;

export function loadExercises(): ExerciseRecord[] {
  if (!cache) cache = (raw as RawExercise[]).map(toExerciseRecord);
  return cache;
}

export function getExerciseById(all: ExerciseRecord[], id: string): ExerciseRecord | undefined {
  return all.find((e) => e.id === id);
}
