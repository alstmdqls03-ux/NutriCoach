import type { LogRow } from '@/lib/repositories/types';
import { normalizeExercise, exerciseKey } from './payload';
import { zonedToday } from '@/lib/tools/dateRange';

export interface ExercisePrefill {
  name: string;
  key: string;
  weight_kg: number;
  reps: number;
  sets: number;
  count: number;
}

interface RawWorkout { exercise?: string; weight_kg?: number; reps?: number; sets?: number; }

// Fold key ignores ALL whitespace so "벤치 프레스" and "벤치프레스" collapse to one chip.
function foldKey(name: string): string {
  return exerciseKey(name).replace(/\s+/g, '');
}

/**
 * Recency-first exercise chips. `rows` MUST be newest-first (queryLogs order).
 * The first time a key is seen carries the most-recent values for prefill; later
 * occurrences only bump the count. Name variants fold via a whitespace-insensitive key.
 */
export function summarizeExercises(rows: LogRow[]): ExercisePrefill[] {
  const byKey = new Map<string, ExercisePrefill>();
  for (const r of rows) {
    if (r.type !== 'workout') continue;
    const d = r.data as RawWorkout;
    if (!d.exercise) continue;
    const key = foldKey(d.exercise);
    const existing = byKey.get(key);
    if (existing) { existing.count++; continue; }
    byKey.set(key, {
      name: normalizeExercise(d.exercise),
      key,
      weight_kg: Number(d.weight_kg ?? 0),
      reps: Number(d.reps ?? 0),
      sets: Number(d.sets ?? 0),
      count: 1,
    });
  }
  return Array.from(byKey.values());
}

export interface WorkoutEntry { exercise: string; weight_kg: number; reps: number; sets: number; }

/** All workout entries from the most recent workout calendar day ("어제처럼 반복"). */
export function lastSessionEntries(rows: LogRow[], tz = 'Asia/Seoul'): WorkoutEntry[] {
  const workouts = rows.filter((r) => r.type === 'workout');
  if (workouts.length === 0) return [];
  const lastDay = zonedToday(workouts[0].logged_at, tz).date;
  return workouts
    .filter((r) => zonedToday(r.logged_at, tz).date === lastDay)
    .map((r) => {
      const d = r.data as RawWorkout;
      return {
        exercise: normalizeExercise(d.exercise ?? ''),
        weight_kg: Number(d.weight_kg ?? 0),
        reps: Number(d.reps ?? 0),
        sets: Number(d.sets ?? 0),
      };
    })
    .filter((e) => e.exercise);
}
