import type { BodyPart, Prescription, SessionLog } from './types';
import type { LogRow } from '@/lib/repositories/types';
import { resolveMachine, DEFAULT_MACHINE_ALIASES, type AliasMap } from './machineMap';

function increment(part: BodyPart): number {
  return part === 'lower' ? 5 : 2.5;
}

/** Double progression from the last logged session. Code-owned numbers; never cited. */
export function nextPrescription(
  exerciseId: string,
  last: SessionLog,
  range: [number, number],
  part: BodyPart,
): Prescription {
  const [bottom, top] = range;
  const inc = increment(part);

  if (last.reps >= top) {
    return {
      exerciseId, weight_kg: last.weight_kg + inc, sets: last.sets, repTarget: bottom,
      basis: 'progressed',
      note: `지난 세션 전 세트 ${last.reps}회 달성 → +${inc}kg, ${bottom}회부터 다시.`,
    };
  }
  if (last.reps < bottom) {
    return {
      exerciseId, weight_kg: Math.max(0, last.weight_kg - inc), sets: last.sets, repTarget: bottom,
      basis: 'deload',
      note: `지난 세션 ${last.reps}회로 ${bottom}회 미달 → -${inc}kg로 자세부터.`,
    };
  }
  return {
    exerciseId, weight_kg: last.weight_kg, sets: last.sets, repTarget: top,
    basis: 'hold',
    note: `같은 ${last.weight_kg}kg로 ${top}회까지 반복수 늘리기.`,
  };
}

/** First session for an exercise with no history. */
export function coldStartPrescription(exerciseId: string, range: [number, number]): Prescription {
  const [bottom] = range;
  return {
    exerciseId, weight_kg: null, sets: 3, repTarget: bottom,
    basis: 'cold-start',
    note: '기록이 없어요. 가볍게 시작해 오늘 기록하면 다음엔 기록 기반으로 추천해요.',
  };
}

/** Most recent workout log whose exercise name maps to `exerciseId`. logs are desc by logged_at. */
export function lastSessionFor(
  exerciseId: string,
  logs: LogRow[],
  aliases: AliasMap = DEFAULT_MACHINE_ALIASES,
): SessionLog | null {
  for (const log of logs) {
    if (log.type !== 'workout') continue;
    const name = log.data.exercise;
    if (typeof name !== 'string') continue;
    if (resolveMachine(name, aliases) !== exerciseId) continue;
    const { weight_kg, reps, sets } = log.data as Record<string, unknown>;
    if (typeof weight_kg === 'number' && typeof reps === 'number' && typeof sets === 'number') {
      return { weight_kg, reps, sets };
    }
  }
  return null;
}
