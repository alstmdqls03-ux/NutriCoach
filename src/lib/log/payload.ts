export interface WorkoutInput { exercise: string; weight_kg: number; reps: number; sets: number; }
export interface SleepInput {
  durationHours?: number;
  quality?: '좋음' | '보통' | '나쁨';
  bed_time?: string;
  wake_time?: string;
  tags?: string[];
}

// Locked v1 context-factor chips (sleep). Allowlist enforced in code so the
// stored jsonb stays aggregatable — unknown values are dropped, never saved.
export const SLEEP_TAGS = ['카페인', '음주', '늦은 운동', '스트레스', '낮잠', '야식'] as const;

/** Trim + collapse internal whitespace. The display/canonical form. */
export function normalizeExercise(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}
/** Match key: canonical form, lowercased (English names case-fold; Korean unaffected). */
export function exerciseKey(name: string): string {
  return normalizeExercise(name).toLowerCase();
}

const QUALITY_TO_SATISFACTION: Record<string, number> = { '좋음': 5, '보통': 3, '나쁨': 1 };

export function buildWorkoutData(i: WorkoutInput): Record<string, unknown> {
  const exercise = normalizeExercise(i.exercise);
  if (!exercise) throw new Error('운동 이름을 입력해주세요.');
  const nums: [string, number][] = [['weight_kg', i.weight_kg], ['reps', i.reps], ['sets', i.sets]];
  for (const [k, v] of nums) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) throw new Error(`${k} 값이 올바르지 않아요.`);
  }
  if (i.reps < 1 || i.sets < 1) throw new Error('반복/세트는 1 이상이어야 해요.');
  return { exercise, weight_kg: i.weight_kg, reps: Math.round(i.reps), sets: Math.round(i.sets) };
}

export function buildSleepData(i: SleepInput): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (typeof i.durationHours === 'number') {
    if (!Number.isFinite(i.durationHours) || i.durationHours <= 0 || i.durationHours > 24) {
      throw new Error('수면 시간이 올바르지 않아요.');
    }
    data.duration_min = Math.round(i.durationHours * 60);
  }
  if (i.bed_time) data.bed_time = i.bed_time;
  if (i.wake_time) data.wake_time = i.wake_time;
  if (i.quality && QUALITY_TO_SATISFACTION[i.quality]) {
    data.satisfaction = QUALITY_TO_SATISFACTION[i.quality];
  }
  if (Array.isArray(i.tags)) {
    const allowed = (SLEEP_TAGS as readonly string[]);
    const tags = Array.from(new Set(i.tags.filter((t) => allowed.includes(t))));
    if (tags.length > 0) data.tags = tags;
  }
  if (data.duration_min === undefined && !data.bed_time && !data.wake_time) {
    throw new Error('수면 시간을 입력해주세요.');
  }
  return data;
}
