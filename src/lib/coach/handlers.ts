import type { LogRepository, MachineAliasRepository } from '@/lib/repositories/types';
import { buildCoachResponse } from '@/lib/coach';
import { loadExercises } from '@/lib/coach/exercises';
import { candidateMachineExercises, type ExerciseChoice } from '@/lib/coach/aliasPicker';
import { normalizeMachineName, type AliasMap } from '@/lib/coach/machineMap';
import type { CoachInput, CoachResponse, Experience } from '@/lib/coach/types';

const EXPERIENCES: Experience[] = ['beginner', 'intermediate', 'advanced'];

// ---- POST /api/coach ----

export interface CoachHandlerArgs {
  body: unknown;
  logs: LogRepository;
  aliases: AliasMap;
}
export interface CoachHandlerResult {
  status: number;
  body: CoachResponse | { error: string };
}

/** Pure core: validate input, read history, assemble response with merged aliases. */
export async function handleCoach(args: CoachHandlerArgs): Promise<CoachHandlerResult> {
  const { body, logs, aliases } = args;
  const b = (body ?? {}) as Record<string, unknown>;
  const machines = Array.isArray(b.machines) ? b.machines.filter((m): m is string => typeof m === 'string') : [];
  const targetMuscle = typeof b.targetMuscle === 'string' ? b.targetMuscle : '';
  const experience = EXPERIENCES.includes(b.experience as Experience) ? (b.experience as Experience) : null;

  if (machines.length === 0) return { status: 400, body: { error: '머신 목록을 입력해주세요.' } };
  if (!targetMuscle) return { status: 400, body: { error: '타겟 부위를 입력해주세요.' } };
  if (!experience) return { status: 400, body: { error: '경험 수준을 선택해주세요.' } };

  const input: CoachInput = {
    machines, targetMuscle, experience,
    estimate: typeof b.estimate === 'string' ? (b.estimate as CoachInput['estimate']) : undefined,
  };
  const history = await logs.queryLogs({ userId: '_self', type: 'workout' });
  return { status: 200, body: buildCoachResponse(input, history, undefined, aliases) };
}

// ---- GET /api/coach/exercises ----

export interface ExercisesResult {
  status: number;
  body: ExerciseChoice[] | { error: string };
}

/** Pure core: muscle term -> candidate machine/cable exercises. */
export function handleExercises(muscle: string | null): ExercisesResult {
  if (!muscle) return { status: 400, body: { error: 'muscle required' } };
  return { status: 200, body: candidateMachineExercises(muscle, loadExercises()) };
}

// ---- POST /api/coach/aliases ----

export interface AddAliasArgs {
  body: unknown;
  aliases: MachineAliasRepository;
}
export interface AddAliasResult {
  status: number;
  body: { ok: true } | { error: string };
}

/** Pure core: validate + persist a user alias. The repo is RLS-scoped by the caller. */
export async function handleAddAlias({ body, aliases }: AddAliasArgs): Promise<AddAliasResult> {
  const b = (body ?? {}) as Record<string, unknown>;
  const rawAlias = typeof b.alias === 'string' ? b.alias : '';
  const exerciseId = typeof b.exerciseId === 'string' ? b.exerciseId : '';
  const alias = normalizeMachineName(rawAlias);

  if (!alias) return { status: 400, body: { error: '별칭을 입력해주세요.' } };
  const exists = loadExercises().some((e) => e.id === exerciseId);
  if (!exists) return { status: 400, body: { error: '운동을 선택해주세요.' } };

  await aliases.addAlias('_self', alias, exerciseId);
  return { status: 200, body: { ok: true } };
}
