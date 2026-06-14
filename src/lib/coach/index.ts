import type { CoachInput, CoachResponse, ExerciseRecord, MachineMiss, Prescription } from './types';
import type { LogRow } from '@/lib/repositories/types';
import { loadExercises, getExerciseById } from './exercises';
import { resolveMachine, DEFAULT_MACHINE_ALIASES, type AliasMap } from './machineMap';
import { buildRoutine } from './routine';
import { coldStartPrescription, lastSessionFor, nextPrescription } from './progression';

export function buildCoachResponse(
  input: CoachInput,
  logs: LogRow[],
  dataset: ExerciseRecord[] = loadExercises(),
  aliases: AliasMap = DEFAULT_MACHINE_ALIASES,
): CoachResponse {
  // Resolve machines -> ids, collecting misses (surfaced, never dropped silently).
  const machineIds: string[] = [];
  const misses: MachineMiss[] = [];
  for (const raw of input.machines) {
    const id = resolveMachine(raw, aliases);
    if (id) machineIds.push(id);
    else misses.push({ input: raw });
  }

  const routine = buildRoutine(
    { machineIds, targetMuscle: input.targetMuscle, experience: input.experience },
    dataset,
  );

  const prescriptions: Prescription[] = routine.exercises.map((ex) => {
    const rec = getExerciseById(dataset, ex.exerciseId);
    const part = rec?.bodyPart ?? 'upper';
    const last = lastSessionFor(ex.exerciseId, logs, aliases);
    return last
      ? nextPrescription(ex.exerciseId, last, ex.repRange, part)
      : coldStartPrescription(ex.exerciseId, ex.repRange);
  });

  return { routine, progression: { prescriptions }, explanations: [], misses };
}
