# Structured Log UI (Approach B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace chat-as-logging with a dedicated structured **Log** surface (sleep chips + workout hybrid, direct DB write, no LLM) plus an immediate streak insight on save, while the existing chat becomes a query/coaching-only **Coach** surface — split by a bottom tab bar.

**Architecture:** Structured input writes deterministically through a new `POST /api/log` route (mirrors `/api/chat`'s auth/RLS pattern but never invokes the LLM). Pure builder functions enforce the locked jsonb data contract so existing `query_logs`/insight readers keep working. A pure `computeStreakInsight` reads recent logs and returns one Korean line (streak, with cold-start + gap fallbacks). Two App Router pages (`/log`, `/coach`) share a `TabBar`; the Coach surface gets a query-only tool set so the LLM has no write path.

**Tech Stack:** Next.js 14 App Router (TS), Supabase (`@supabase/ssr`, Postgres + RLS), Vitest. No new dependencies. No schema change (same `logs` table + jsonb shape).

---

## Locked Data Contract (do not drift — readers depend on byte-identical keys)

- **workout** `data` jsonb: `{ exercise: string, weight_kg: number, reps: number, sets: number }`
- **sleep** `data` jsonb: `{ bed_time?: string, wake_time?: string, duration_min?: number, satisfaction?: number }`
- Sleep quality toggle → `satisfaction`: 좋음 = 5, 보통 = 3, 나쁨 = 1.
- Sleep duration entered in **hours**, stored as `duration_min` (× 60, rounded).
- `logged_at` (column, not jsonb) is what `query_logs` and the streak read. The Log surface's date control sets `logged_at`; default = now.
- Exercise canonical form: `trim()` + collapse internal whitespace; match key additionally lowercased (so "벤치프레스" / "벤치 프레스" / "Bench Press" don't fork).

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/insights/streak.ts` (new) | Pure streak computation + insight line (value layer). |
| `src/lib/log/payload.ts` (new) | Pure builders: structured UI input → contract jsonb; validation; exercise normalization. |
| `src/lib/log/history.ts` (new) | Pure: recent workout rows → exercise prefill chips + last-session clone. |
| `src/lib/repositories/types.ts` (modify) | Add `deleteLastLog` to `LogRepository`. |
| `src/lib/repositories/supabaseRepositories.ts` (modify) | Implement `deleteLastLog`. |
| `tests/fakes/repositories.ts` (modify) | Fake `deleteLastLog`. |
| `src/app/api/log/route.ts` (new) | `POST` (validate → insert → insight), `DELETE` (delete-last). No LLM. |
| `src/components/TabBar.tsx` (new) | Bottom tab nav (기록 / 코치). |
| `src/app/page.tsx` (modify) | Root redirects to `/log`. |
| `src/app/coach/page.tsx` (new) | The existing chat home, moved + TabBar. |
| `src/app/log/page.tsx` (new) | Server: load prefill history → render `LogClient` + TabBar. |
| `src/components/SleepLog.tsx` (new) | Sleep input: duration chips/stepper + quality toggle. |
| `src/components/WorkoutLog.tsx` (new) | Workout hybrid: recent chips + prefilled steppers + 어제처럼 반복 + 종목 추가. |
| `src/components/LogClient.tsx` (new) | Owns date control, POST `/api/log`, insight + 오늘 요약 render, delete-last, logout. |
| `src/lib/tools/definitions.ts` (modify) | Add `coachToolDefinitions` (query_logs only). |
| `src/lib/chat/orchestrator.ts` (modify) | `runChat` accepts optional `tools` (default = full set). |
| `src/app/api/chat/route.ts` (modify) | Pass `coachToolDefinitions` so the coach has no write path. |
| `src/components/Chat.tsx` (modify) | Empty-state + placeholder copy → coaching, not logging. |

---

### Task 1: Streak insight (value layer)

**Files:**
- Create: `src/lib/insights/streak.ts`
- Test: `tests/insights/streak.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/insights/streak.test.ts
import { describe, it, expect } from 'vitest';
import { distinctLocalDays, streakEndingToday, computeStreakInsight } from '@/lib/insights/streak';
import type { LogRow } from '@/lib/repositories/types';

const row = (logged_at: string): LogRow => ({ id: 'x', type: 'workout', data: {}, logged_at });

describe('streak insight', () => {
  it('dedups multiple logs on the same local day', () => {
    const days = distinctLocalDays([
      row('2026-06-12T01:00:00Z'), // 10:00 KST 6/12
      row('2026-06-12T09:00:00Z'), // 18:00 KST 6/12
    ]);
    expect(days.size).toBe(1);
    expect(days.has('2026-06-12')).toBe(true);
  });

  it('counts consecutive days ending today', () => {
    const days = new Set(['2026-06-10', '2026-06-11', '2026-06-12']);
    expect(streakEndingToday(days, '2026-06-12')).toBe(3);
  });

  it('stops the streak at a gap', () => {
    const days = new Set(['2026-06-09', '2026-06-12']);
    expect(streakEndingToday(days, '2026-06-12')).toBe(1);
  });

  it('cold-start copy on the first-ever day', () => {
    const line = computeStreakInsight([row('2026-06-12T02:00:00Z')], '2026-06-12T02:00:00Z');
    expect(line).toMatch(/첫 기록/);
  });

  it('streak copy with the count when >= 2 consecutive days', () => {
    const line = computeStreakInsight(
      [row('2026-06-11T02:00:00Z'), row('2026-06-12T02:00:00Z')],
      '2026-06-12T02:00:00Z',
    );
    expect(line).toMatch(/연속 2일/);
  });

  it('gap fallback: history exists but yesterday missing → encouragement, no fabricated number', () => {
    const line = computeStreakInsight(
      [row('2026-06-09T02:00:00Z'), row('2026-06-12T02:00:00Z')],
      '2026-06-12T02:00:00Z',
    );
    expect(line).toMatch(/다시 시작/);
    expect(line).not.toMatch(/연속/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/insights/streak.test.ts`
Expected: FAIL — cannot find module `@/lib/insights/streak`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/insights/streak.ts
import { zonedToday, addDays } from '@/lib/tools/dateRange';
import type { LogRow } from '@/lib/repositories/types';

/** Distinct local calendar dates (YYYY-MM-DD in tz) present across the logs. */
export function distinctLocalDays(rows: LogRow[], tz = 'Asia/Seoul'): Set<string> {
  const days = new Set<string>();
  for (const r of rows) days.add(zonedToday(r.logged_at, tz).date);
  return days;
}

/** Consecutive-day streak ending at `today` (YYYY-MM-DD), inclusive. 0 if today absent. */
export function streakEndingToday(days: Set<string>, today: string): number {
  let n = 0;
  let cursor = today;
  while (days.has(cursor)) {
    n++;
    cursor = addDays(cursor, -1);
  }
  return n;
}

/**
 * One Korean insight line for the just-saved log. Never fabricates a number and
 * never returns empty (design Premise 3 + safe-fallback). Called right after an
 * insert, so today is always present in `rows`.
 */
export function computeStreakInsight(rows: LogRow[], nowIso: string, tz = 'Asia/Seoul'): string {
  const today = zonedToday(nowIso, tz).date;
  const days = distinctLocalDays(rows, tz);
  if (days.size <= 1) return '첫 기록 완료! 🎉 내일 또 오면 추세가 보이기 시작해요.';
  const streak = streakEndingToday(days, today);
  if (streak >= 2) return `연속 ${streak}일째 기록 중이에요 🔥`;
  return '다시 시작이에요! 오늘도 기록 완료 💪';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/insights/streak.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/insights/streak.ts tests/insights/streak.test.ts
git commit -m "feat: streak insight value layer (pure, tested)"
```

---

### Task 2: Structured payload builders

**Files:**
- Create: `src/lib/log/payload.ts`
- Test: `tests/log/payload.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/log/payload.test.ts
import { describe, it, expect } from 'vitest';
import {
  normalizeExercise, exerciseKey, buildWorkoutData, buildSleepData,
} from '@/lib/log/payload';

describe('payload builders', () => {
  it('normalizes exercise whitespace; key is lowercased', () => {
    expect(normalizeExercise('  벤치  프레스 ')).toBe('벤치 프레스');
    expect(exerciseKey('Bench  Press')).toBe('bench press');
  });

  it('builds workout contract jsonb and rounds reps/sets', () => {
    expect(buildWorkoutData({ exercise: ' 스쿼트 ', weight_kg: 80, reps: 5, sets: 5 }))
      .toEqual({ exercise: '스쿼트', weight_kg: 80, reps: 5, sets: 5 });
  });

  it('rejects empty exercise and bad numbers', () => {
    expect(() => buildWorkoutData({ exercise: '  ', weight_kg: 80, reps: 5, sets: 5 })).toThrow();
    expect(() => buildWorkoutData({ exercise: '스쿼트', weight_kg: -1, reps: 5, sets: 5 })).toThrow();
    expect(() => buildWorkoutData({ exercise: '스쿼트', weight_kg: 80, reps: 0, sets: 5 })).toThrow();
  });

  it('maps sleep hours → duration_min and quality → satisfaction', () => {
    expect(buildSleepData({ durationHours: 7.5, quality: '좋음' }))
      .toEqual({ duration_min: 450, satisfaction: 5 });
    expect(buildSleepData({ durationHours: 6, quality: '나쁨' }))
      .toEqual({ duration_min: 360, satisfaction: 1 });
  });

  it('rejects sleep with no time info and out-of-range duration', () => {
    expect(() => buildSleepData({})).toThrow();
    expect(() => buildSleepData({ durationHours: 0 })).toThrow();
    expect(() => buildSleepData({ durationHours: 25 })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/log/payload.test.ts`
Expected: FAIL — cannot find module `@/lib/log/payload`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/log/payload.ts
export interface WorkoutInput { exercise: string; weight_kg: number; reps: number; sets: number; }
export interface SleepInput {
  durationHours?: number;
  quality?: '좋음' | '보통' | '나쁨';
  bed_time?: string;
  wake_time?: string;
}

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
  if (data.duration_min === undefined && !data.bed_time && !data.wake_time) {
    throw new Error('수면 시간을 입력해주세요.');
  }
  return data;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/log/payload.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/log/payload.ts tests/log/payload.test.ts
git commit -m "feat: structured log payload builders (locked data contract)"
```

---

### Task 3: Workout history → prefill chips

**Files:**
- Create: `src/lib/log/history.ts`
- Test: `tests/log/history.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/log/history.test.ts
import { describe, it, expect } from 'vitest';
import { summarizeExercises, lastSessionEntries } from '@/lib/log/history';
import type { LogRow } from '@/lib/repositories/types';

// queryLogs returns newest-first; mirror that ordering here.
const rows: LogRow[] = [
  { id: '4', type: 'workout', data: { exercise: '벤치 프레스', weight_kg: 65, reps: 8, sets: 3 }, logged_at: '2026-06-12T01:00:00Z' },
  { id: '3', type: 'workout', data: { exercise: '스쿼트', weight_kg: 80, reps: 5, sets: 5 }, logged_at: '2026-06-12T00:30:00Z' },
  { id: '2', type: 'sleep', data: { duration_min: 420 }, logged_at: '2026-06-11T20:00:00Z' },
  { id: '1', type: 'workout', data: { exercise: '벤치프레스', weight_kg: 60, reps: 8, sets: 3 }, logged_at: '2026-06-09T01:00:00Z' },
];

describe('workout history', () => {
  it('summarizes exercises recency-first with last values, folding name variants', () => {
    const ex = summarizeExercises(rows);
    expect(ex.map((e) => e.name)).toEqual(['벤치 프레스', '스쿼트']); // 벤치프레스 folds into 벤치 프레스
    expect(ex[0]).toMatchObject({ weight_kg: 65, reps: 8, sets: 3, count: 2 });
    expect(ex[1]).toMatchObject({ weight_kg: 80, count: 1 });
  });

  it('clones the most recent calendar-day session (excludes sleep + older days)', () => {
    const last = lastSessionEntries(rows);
    expect(last.map((e) => e.exercise)).toEqual(['벤치 프레스', '스쿼트']);
    expect(last.every((e) => 'weight_kg' in e)).toBe(true);
  });

  it('returns empty arrays when there is no workout history', () => {
    expect(summarizeExercises([])).toEqual([]);
    expect(lastSessionEntries([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/log/history.test.ts`
Expected: FAIL — cannot find module `@/lib/log/history`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/log/history.ts
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

/**
 * Recency-first exercise chips. `rows` MUST be newest-first (queryLogs order).
 * The first time a key is seen carries the most-recent values for prefill; later
 * occurrences only bump the count. Name variants fold via exerciseKey.
 */
export function summarizeExercises(rows: LogRow[]): ExercisePrefill[] {
  const byKey = new Map<string, ExercisePrefill>();
  for (const r of rows) {
    if (r.type !== 'workout') continue;
    const d = r.data as RawWorkout;
    if (!d.exercise) continue;
    const key = exerciseKey(d.exercise);
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
  return [...byKey.values()];
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/log/history.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/log/history.ts tests/log/history.test.ts
git commit -m "feat: workout history summarizer for prefill chips"
```

---

### Task 4: Repository delete-last-entry

**Files:**
- Modify: `src/lib/repositories/types.ts`
- Modify: `src/lib/repositories/supabaseRepositories.ts:7-27`
- Modify: `tests/fakes/repositories.ts:6-20`
- Test: `tests/repositories/deleteLast.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/repositories/deleteLast.test.ts
import { describe, it, expect } from 'vitest';
import { InMemoryLogRepository } from '../fakes/repositories';

describe('deleteLastLog', () => {
  it('removes the most recently inserted row for the user only', async () => {
    const repo = new InMemoryLogRepository();
    await repo.insertLog({ userId: 'u1', type: 'workout', data: { exercise: 'a' }, loggedAt: '2026-06-12T00:00:00Z' });
    await repo.insertLog({ userId: 'u1', type: 'sleep', data: { duration_min: 420 }, loggedAt: '2026-06-12T01:00:00Z' });
    await repo.insertLog({ userId: 'u2', type: 'workout', data: { exercise: 'b' }, loggedAt: '2026-06-12T02:00:00Z' });

    expect(await repo.deleteLastLog('u1')).toBe(true);
    const left = await repo.queryLogs({ userId: 'u1' });
    expect(left.map((r) => r.type)).toEqual(['workout']); // the sleep (last for u1) was removed
    expect((await repo.queryLogs({ userId: 'u2' })).length).toBe(1); // u2 untouched
  });

  it('returns false when the user has no logs', async () => {
    const repo = new InMemoryLogRepository();
    expect(await repo.deleteLastLog('nobody')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/repositories/deleteLast.test.ts`
Expected: FAIL — `repo.deleteLastLog is not a function`.

- [ ] **Step 3a: Add to the interface**

In `src/lib/repositories/types.ts`, extend `LogRepository`:

```ts
export interface LogRepository {
  insertLog(input: InsertLogInput): Promise<void>;
  queryLogs(input: QueryLogInput): Promise<LogRow[]>;
  deleteLastLog(userId: string): Promise<boolean>;
}
```

- [ ] **Step 3b: Implement in the Supabase repo**

In `src/lib/repositories/supabaseRepositories.ts`, add this method inside `supabaseLogRepository`'s returned object (after `queryLogs`):

```ts
    async deleteLastLog(userId: string): Promise<boolean> {
      // Most recently *created* row (created_at), per the design's "마지막" rule.
      const { data, error } = await sb.from('logs')
        .select('id').eq('user_id', userId)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (error) throw new Error(`deleteLastLog read failed: ${error.message}`);
      if (!data) return false;
      const del = await sb.from('logs').delete().eq('user_id', userId).eq('id', data.id);
      if (del.error) throw new Error(`deleteLastLog failed: ${del.error.message}`);
      return true;
    },
```

- [ ] **Step 3c: Implement in the fake**

In `tests/fakes/repositories.ts`, add to `InMemoryLogRepository` (insertion order = created_at order, so the last matching row is the most recent):

```ts
  async deleteLastLog(userId: string): Promise<boolean> {
    for (let idx = this.rows.length - 1; idx >= 0; idx--) {
      if (this.rows[idx].userId === userId) { this.rows.splice(idx, 1); return true; }
    }
    return false;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/repositories/deleteLast.test.ts`
Expected: PASS (2 tests).

Then the full suite (the interface change must not break existing fakes/usages):
Run: `npx vitest run`
Expected: PASS (all prior tests + the new ones).

- [ ] **Step 5: Commit**

```bash
git add src/lib/repositories/types.ts src/lib/repositories/supabaseRepositories.ts tests/fakes/repositories.ts tests/repositories/deleteLast.test.ts
git commit -m "feat: deleteLastLog repository method"
```

---

### Task 5: POST/DELETE /api/log route (no LLM)

**Files:**
- Create: `src/app/api/log/route.ts`

Note: this route has no unit test (it depends on the Supabase session); it is verified live in Task 9. It reuses the Task 2 builders and Task 1 insight, both already tested.

- [ ] **Step 1: Write the route**

```ts
// src/app/api/log/route.ts
import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseLogRepository } from '@/lib/repositories/supabaseRepositories';
import { buildWorkoutData, buildSleepData, type WorkoutInput, type SleepInput } from '@/lib/log/payload';
import { computeStreakInsight } from '@/lib/insights/streak';

const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;

export async function POST(req: Request) {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  const user = data.user;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const type = body?.type;
  // Date control on the Log surface sets logged_at; default to now.
  const loggedAt = typeof body?.loggedAt === 'string' && !Number.isNaN(Date.parse(body.loggedAt))
    ? new Date(body.loggedAt).toISOString()
    : new Date().toISOString();

  let payload: Record<string, unknown>;
  try {
    if (type === 'workout') payload = buildWorkoutData(body?.data as WorkoutInput);
    else if (type === 'sleep') payload = buildSleepData(body?.data as SleepInput);
    else return NextResponse.json({ error: 'type must be workout|sleep' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const logs = supabaseLogRepository(sb);
  try {
    await logs.insertLog({ userId: user.id, type, data: payload, loggedAt });
    const since = new Date(Date.parse(loggedAt) - SIXTY_DAYS_MS).toISOString();
    const recent = await logs.queryLogs({ userId: user.id, from: since });
    const insight = computeStreakInsight(recent, loggedAt);
    return NextResponse.json({ ok: true, insight });
  } catch (e) {
    console.error('log error', e);
    return NextResponse.json({ error: '저장에 실패했어요. 다시 시도해주세요.' }, { status: 500 });
  }
}

export async function DELETE() {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  const user = data.user;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const ok = await supabaseLogRepository(sb).deleteLastLog(user.id);
    return NextResponse.json({ ok });
  } catch (e) {
    console.error('log delete error', e);
    return NextResponse.json({ error: '삭제에 실패했어요.' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/log/route.ts
git commit -m "feat: POST/DELETE /api/log structured write route (no LLM)"
```

---

### Task 6: Tab bar + Log/Coach routing

**Files:**
- Create: `src/components/TabBar.tsx`
- Create: `src/app/coach/page.tsx`
- Create: `src/app/log/page.tsx` (stub; finalized in Task 9)
- Modify: `src/app/page.tsx` (whole file)

- [ ] **Step 1: Create the TabBar**

```tsx
// src/components/TabBar.tsx
'use client';
import { usePathname, useRouter } from 'next/navigation';

const TABS = [{ href: '/log', label: '기록' }, { href: '/coach', label: '코치' }];

export default function TabBar() {
  const pathname = usePathname();
  const router = useRouter();
  return (
    <nav style={{
      display: 'flex', maxWidth: 600, margin: '0 auto',
      borderTop: '1px solid #eee', position: 'sticky', bottom: 0, background: '#fff',
    }}>
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <button key={t.href} onClick={() => router.push(t.href)}
            style={{
              flex: 1, padding: 14, border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 15, fontWeight: active ? 700 : 400, color: active ? '#0070f3' : '#666',
            }}>
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Move the chat home to /coach**

```tsx
// src/app/coach/page.tsx
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import Chat, { type Turn } from '@/components/Chat';
import TabBar from '@/components/TabBar';

export default async function CoachPage() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const { data: rows } = await sb
    .from('messages')
    .select('role, content, tool_calls, created_at')
    .order('created_at', { ascending: false })
    .limit(40);

  const initialTurns: Turn[] = (rows ?? [])
    .filter((r) => r.content && (r.role === 'user' || (r.role === 'assistant' && !r.tool_calls)))
    .reverse()
    .map((r) => ({ role: r.role === 'user' ? 'user' : 'assistant', text: r.content as string }));

  return (<><Chat initialTurns={initialTurns} /><TabBar /></>);
}
```

- [ ] **Step 3: Create the /log stub**

```tsx
// src/app/log/page.tsx
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import TabBar from '@/components/TabBar';

export default async function LogPage() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');
  return (
    <div style={{ maxWidth: 600, margin: '40px auto', fontFamily: 'system-ui', padding: 12 }}>
      <p style={{ color: '#666' }}>기록 화면 준비 중…</p>
      <TabBar />
    </div>
  );
}
```

- [ ] **Step 4: Point the root at /log**

Replace the entire contents of `src/app/page.tsx`:

```tsx
import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/log');
}
```

- [ ] **Step 5: Typecheck + verify routing**

Run: `npx tsc --noEmit`
Expected: no errors.

Run (dev server already on :3100): open `http://localhost:3100/` → redirects to `/log` (stub) → tap 코치 tab → chat loads at `/coach`. Confirm both tabs switch.

- [ ] **Step 6: Commit**

```bash
git add src/components/TabBar.tsx src/app/coach/page.tsx src/app/log/page.tsx src/app/page.tsx
git commit -m "feat: bottom tab bar + Log/Coach route split"
```

---

### Task 7: Sleep log component

**Files:**
- Create: `src/components/SleepLog.tsx`

`SleepLog` is presentational: it owns its own field state and calls `onSubmit(input)` with a `SleepInput`. The parent (`LogClient`) owns the date and the network call. No unit test (no component harness); verified live in Task 9.

- [ ] **Step 1: Write the component**

```tsx
// src/components/SleepLog.tsx
'use client';
import { useState } from 'react';
import type { SleepInput } from '@/lib/log/payload';

const DURATIONS = [5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9];
const QUALITIES: SleepInput['quality'][] = ['좋음', '보통', '나쁨'];

export default function SleepLog({ onSubmit, busy }: {
  onSubmit: (input: SleepInput) => void;
  busy: boolean;
}) {
  const [hours, setHours] = useState(7);
  const [quality, setQuality] = useState<SleepInput['quality']>('보통');

  return (
    <section style={{ border: '1px solid #eee', borderRadius: 12, padding: 16, marginBottom: 16 }}>
      <h3 style={{ margin: '0 0 12px' }}>수면</h3>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {DURATIONS.map((h) => (
          <button key={h} onClick={() => setHours(h)} type="button"
            style={chip(h === hours)}>{h}시간</button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {QUALITIES.map((q) => (
          <button key={q} onClick={() => setQuality(q)} type="button"
            style={chip(q === quality)}>{q}</button>
        ))}
      </div>

      <button type="button" disabled={busy}
        onClick={() => onSubmit({ durationHours: hours, quality })}
        style={primaryBtn(busy)}>
        수면 기록
      </button>
    </section>
  );
}

function chip(active: boolean): React.CSSProperties {
  return {
    padding: '8px 12px', borderRadius: 999, cursor: 'pointer', fontSize: 14,
    border: active ? '1px solid #0070f3' : '1px solid #ddd',
    background: active ? '#e8f1ff' : '#fff', color: active ? '#0070f3' : '#333',
  };
}
function primaryBtn(busy: boolean): React.CSSProperties {
  return {
    width: '100%', padding: 12, borderRadius: 8, border: 'none', fontSize: 15,
    background: busy ? '#9bbcf0' : '#0070f3', color: '#fff', cursor: busy ? 'default' : 'pointer',
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/SleepLog.tsx
git commit -m "feat: sleep log component (duration chips + quality toggle)"
```

---

### Task 8: Workout log component

**Files:**
- Create: `src/components/WorkoutLog.tsx`

Presentational. Builds a list of session entries (chips prefill the steppers from history; 어제처럼 반복 clones last session; + 종목 adds a free-text exercise). Calls `onSubmit(entries)` with `WorkoutInput[]`.

- [ ] **Step 1: Write the component**

```tsx
// src/components/WorkoutLog.tsx
'use client';
import { useState } from 'react';
import type { WorkoutInput } from '@/lib/log/payload';
import type { ExercisePrefill, WorkoutEntry } from '@/lib/log/history';

export default function WorkoutLog({ exercises, lastSession, onSubmit, busy }: {
  exercises: ExercisePrefill[];
  lastSession: WorkoutEntry[];
  onSubmit: (entries: WorkoutInput[]) => void;
  busy: boolean;
}) {
  const [entries, setEntries] = useState<WorkoutInput[]>([]);
  const [newName, setNewName] = useState('');

  function addEntry(e: WorkoutInput) { setEntries((cur) => [...cur, e]); }
  function update(i: number, patch: Partial<WorkoutInput>) {
    setEntries((cur) => cur.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  }
  function remove(i: number) { setEntries((cur) => cur.filter((_, idx) => idx !== i)); }

  return (
    <section style={{ border: '1px solid #eee', borderRadius: 12, padding: 16, marginBottom: 16 }}>
      <h3 style={{ margin: '0 0 12px' }}>운동</h3>

      {lastSession.length > 0 && (
        <button type="button" onClick={() => setEntries(lastSession.map((e) => ({ ...e })))}
          style={{ ...chip(false), marginBottom: 12, width: '100%' }}>
          ↻ 어제처럼 반복 ({lastSession.map((e) => e.exercise).join(', ')})
        </button>
      )}

      {exercises.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {exercises.map((ex) => (
            <button key={ex.key} type="button"
              onClick={() => addEntry({ exercise: ex.name, weight_kg: ex.weight_kg, reps: ex.reps, sets: ex.sets })}
              style={chip(false)}>+ {ex.name}</button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <input value={newName} onChange={(e) => setNewName(e.target.value)}
          placeholder="+ 종목 직접 입력" aria-label="새 종목"
          style={{ flex: 1, padding: 8, border: '1px solid #ddd', borderRadius: 8 }} />
        <button type="button"
          onClick={() => {
            if (!newName.trim()) return;
            addEntry({ exercise: newName.trim(), weight_kg: 20, reps: 10, sets: 3 });
            setNewName('');
          }}
          style={chip(false)}>추가</button>
      </div>

      {entries.map((e, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <b style={{ flexBasis: '100%' }}>{e.exercise}</b>
          <Stepper label="kg" value={e.weight_kg} step={2.5} onChange={(v) => update(i, { weight_kg: v })} />
          <Stepper label="회" value={e.reps} step={1} onChange={(v) => update(i, { reps: v })} />
          <Stepper label="세트" value={e.sets} step={1} onChange={(v) => update(i, { sets: v })} />
          <button type="button" onClick={() => remove(i)} style={{ ...chip(false), color: '#c00' }}>삭제</button>
        </div>
      ))}

      <button type="button" disabled={busy || entries.length === 0}
        onClick={() => onSubmit(entries)}
        style={primaryBtn(busy || entries.length === 0)}>
        운동 기록 ({entries.length})
      </button>
    </section>
  );
}

function Stepper({ label, value, step, onChange }: {
  label: string; value: number; step: number; onChange: (v: number) => void;
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <button type="button" onClick={() => onChange(Math.max(0, +(value - step).toFixed(2)))} style={stepBtn}>−</button>
      <span style={{ minWidth: 48, textAlign: 'center' }}>{value}{label}</span>
      <button type="button" onClick={() => onChange(+(value + step).toFixed(2))} style={stepBtn}>+</button>
    </span>
  );
}

const stepBtn: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 8, border: '1px solid #ddd', background: '#fff',
  fontSize: 18, cursor: 'pointer', lineHeight: 1,
};
function chip(active: boolean): React.CSSProperties {
  return {
    padding: '8px 12px', borderRadius: 999, cursor: 'pointer', fontSize: 14,
    border: active ? '1px solid #0070f3' : '1px solid #ddd',
    background: active ? '#e8f1ff' : '#fff', color: active ? '#0070f3' : '#333',
  };
}
function primaryBtn(disabled: boolean): React.CSSProperties {
  return {
    width: '100%', padding: 12, borderRadius: 8, border: 'none', fontSize: 15, marginTop: 4,
    background: disabled ? '#9bbcf0' : '#0070f3', color: '#fff', cursor: disabled ? 'default' : 'pointer',
  };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/WorkoutLog.tsx
git commit -m "feat: workout log component (chips + prefill steppers + repeat-last)"
```

---

### Task 9: Log surface integration

**Files:**
- Create: `src/components/LogClient.tsx`
- Modify: `src/app/log/page.tsx` (replace the Task 6 stub)

`LogClient` owns: the shared date control, the POST calls (sequential per workout entry), the insight + 오늘 요약 render, delete-last, logout, and the synchronous re-entrancy guard (QA double-send fix).

- [ ] **Step 1: Write LogClient**

```tsx
// src/components/LogClient.tsx
'use client';
import { useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import SleepLog from './SleepLog';
import WorkoutLog from './WorkoutLog';
import type { WorkoutInput, SleepInput } from '@/lib/log/payload';
import type { ExercisePrefill, WorkoutEntry } from '@/lib/log/history';

function todayLocal(): string {
  // YYYY-MM-DD in the browser's local zone, for the date <input>.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function LogClient({ exercises, lastSession }: {
  exercises: ExercisePrefill[];
  lastSession: WorkoutEntry[];
}) {
  const [date, setDate] = useState(todayLocal());
  const [busy, setBusy] = useState(false);
  const [insight, setInsight] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const sendingRef = useRef(false);

  // loggedAt: noon on the chosen local day → stable across timezones, never
  // crosses a day boundary when converted to UTC for Asia/Seoul.
  function loggedAtForDate(): string {
    return new Date(`${date}T12:00:00`).toISOString();
  }

  async function post(type: 'workout' | 'sleep', data: WorkoutInput | SleepInput): Promise<string | null> {
    const res = await fetch('/api/log', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, data, loggedAt: loggedAtForDate() }),
    });
    if (res.status === 401) { window.location.href = '/login'; return null; }
    const json = await res.json().catch(() => ({} as { insight?: string; error?: string }));
    if (!res.ok) { setError(json.error ?? '저장에 실패했어요.'); return null; }
    return json.insight ?? null;
  }

  async function submitWorkout(entries: WorkoutInput[]) {
    if (sendingRef.current) return;
    sendingRef.current = true; setBusy(true); setError(null);
    try {
      let last: string | null = null;
      for (const e of entries) last = await post('workout', e);
      if (last !== null) { setInsight(last); setCanUndo(true); }
    } finally { setBusy(false); sendingRef.current = false; }
  }

  async function submitSleep(input: SleepInput) {
    if (sendingRef.current) return;
    sendingRef.current = true; setBusy(true); setError(null);
    try {
      const line = await post('sleep', input);
      if (line !== null) { setInsight(line); setCanUndo(true); }
    } finally { setBusy(false); sendingRef.current = false; }
  }

  async function undoLast() {
    if (sendingRef.current) return;
    sendingRef.current = true; setBusy(true);
    try {
      const res = await fetch('/api/log', { method: 'DELETE' });
      if (res.ok) { setInsight('마지막 기록을 취소했어요.'); setCanUndo(false); }
    } finally { setBusy(false); sendingRef.current = false; }
  }

  async function logout() {
    try { await supabaseBrowser().auth.signOut(); } finally { window.location.href = '/login'; }
  }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', fontFamily: 'system-ui', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>기록</h2>
        <button onClick={logout} style={{ fontSize: 13, padding: '4px 10px' }}>로그아웃</button>
      </div>

      <label style={{ display: 'block', fontSize: 13, color: '#666', marginBottom: 16 }}>
        날짜&nbsp;
        <input type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)}
          style={{ padding: 6, border: '1px solid #ddd', borderRadius: 6 }} />
      </label>

      {insight && (
        <div style={{ background: '#f0f7ff', border: '1px solid #cfe3ff', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
          <span>{insight}</span>
          {canUndo && (
            <button onClick={undoLast} disabled={busy}
              style={{ marginLeft: 10, fontSize: 13, color: '#0070f3', background: 'none', border: 'none', cursor: 'pointer' }}>
              방금 기록 취소
            </button>
          )}
        </div>
      )}
      {error && <p style={{ color: '#c00', marginTop: 0 }}>{error}</p>}

      <WorkoutLog exercises={exercises} lastSession={lastSession} onSubmit={submitWorkout} busy={busy} />
      <SleepLog onSubmit={submitSleep} busy={busy} />
    </div>
  );
}
```

- [ ] **Step 2: Wire LogClient into the page (replace the stub)**

Replace the entire contents of `src/app/log/page.tsx`:

```tsx
// src/app/log/page.tsx
import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseLogRepository } from '@/lib/repositories/supabaseRepositories';
import { summarizeExercises, lastSessionEntries } from '@/lib/log/history';
import LogClient from '@/components/LogClient';
import TabBar from '@/components/TabBar';

const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;

export default async function LogPage() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const since = new Date(Date.now() - SIXTY_DAYS_MS).toISOString();
  const rows = await supabaseLogRepository(sb).queryLogs({ userId: user.id, from: since });
  const exercises = summarizeExercises(rows);
  const lastSession = lastSessionEntries(rows);

  return (<><LogClient exercises={exercises} lastSession={lastSession} /><TabBar /></>);
}
```

- [ ] **Step 3: Typecheck + lint + build**

Run: `npx tsc --noEmit && npx eslint . && npx vitest run`
Expected: tsc clean, eslint clean, all tests pass.

- [ ] **Step 4: Live verification (browse on :3100)**

Verify each, capturing a screenshot:
1. `/log` shows the date control + 운동 + 수면 sections.
2. Tap a recent-exercise chip (or 종목 추가) → a stepper row appears; +2.5kg works → tap 운동 기록 → an insight line renders (cold-start copy on a fresh account, streak copy otherwise).
3. Tap 수면 7시간 + 좋음 → 수면 기록 → insight line renders.
4. Tap 방금 기록 취소 → "마지막 기록을 취소했어요."
5. Confirm in Supabase: workout rows have `data` = `{exercise, weight_kg, reps, sets}`, sleep has `{duration_min, satisfaction}` (contract intact).

- [ ] **Step 5: Commit**

```bash
git add src/components/LogClient.tsx src/app/log/page.tsx
git commit -m "feat: log surface integration (date, insight, undo, structured write)"
```

---

### Task 10: Coach surface = query-only (remove LLM write path)

**Files:**
- Modify: `src/lib/tools/definitions.ts` (append an export)
- Modify: `src/lib/chat/orchestrator.ts:27-45,124-125`
- Modify: `src/app/api/chat/route.ts:6-7,21-33`
- Modify: `src/components/Chat.tsx:54-77`
- Test: `tests/chat/coachTools.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/chat/coachTools.test.ts
import { describe, it, expect } from 'vitest';
import { coachToolDefinitions } from '@/lib/tools/definitions';

describe('coach tool set', () => {
  it('exposes query_logs only — no LLM write path on the coach surface', () => {
    const names = coachToolDefinitions.map((t) => t.name);
    expect(names).toEqual(['query_logs']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/chat/coachTools.test.ts`
Expected: FAIL — `coachToolDefinitions` is not exported.

- [ ] **Step 3a: Export the query-only set**

Append to `src/lib/tools/definitions.ts` (after the `toolDefinitions` array):

```ts
// The Coach surface is query/advice only — logging moved to the structured Log
// surface (POST /api/log, no LLM). Exposing only query_logs guarantees the LLM
// has no write path (design: "Chat-logging is REMOVED in this build").
export const coachToolDefinitions: ToolDefinition[] =
  toolDefinitions.filter((t) => t.name === 'query_logs');
```

- [ ] **Step 3b: Let runChat take an optional tool set**

In `src/lib/chat/orchestrator.ts`, add `tools` to `RunChatArgs` (after `contextLimit`):

```ts
  contextLimit: number;
  tools?: ToolDefinition[];   // defaults to the full set (back-compat with tests)
```

Then in `runChat`, destructure it with a default and use it in the chat loop. Change the destructure line:

```ts
  const { userId, userMessage, llm, logs, msgs, prof, now, maxToolRounds, contextLimit,
    tools = toolDefinitions } = args;
```

And change the loop call from `chatWithRetry(llm, convo, toolDefinitions)` to:

```ts
    const res = await chatWithRetry(llm, convo, tools);
```

(`toolDefinitions` is already imported at the top — keep that import; it is now also the default value.)

- [ ] **Step 3c: Coach route passes the query-only set**

In `src/app/api/chat/route.ts`, import the coach set and pass it. Change the import line:

```ts
import { runChat } from '@/lib/chat/orchestrator';
import { coachToolDefinitions } from '@/lib/tools/definitions';
```

Add to the `runChat({ ... })` args object (e.g. after `contextLimit`):

```ts
      tools: coachToolDefinitions,
```

- [ ] **Step 3d: Repoint the chat copy to coaching**

In `src/components/Chat.tsx`, replace the empty-state block (the `turns.length === 0` paragraph) with coaching examples, and update the input `placeholder`:

```tsx
        {turns.length === 0 && (
          <div style={{ color: '#666', lineHeight: 1.6 }}>
            <p style={{ margin: '0 0 8px' }}>기록을 돌아보고 코칭해드려요. 기록은 &apos;기록&apos; 탭에서 해주세요.</p>
            <p style={{ margin: 0 }}>
              이렇게 물어보세요:<br />
              · &quot;이번 주 운동 어땠어?&quot;<br />
              · &quot;요즘 수면 어때?&quot;<br />
              · &quot;다음 운동 추천해줘&quot;
            </p>
          </div>
        )}
```

And the input:

```tsx
          placeholder="예: 이번 주 운동 어땠어?"
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all tests pass (existing orchestrator tests still green because `tools` defaults to the full set), tsc clean.

- [ ] **Step 5: Live verification**

On `/coach`: ask "이번 주 운동 어땠어?" → it queries and answers. Try "스쿼트 80 5회 5세트 했어" → it should NOT write a log (no log tool available); it should redirect you to the 기록 탭. Confirm no new workout row appears in Supabase from the chat.

- [ ] **Step 6: Commit**

```bash
git add src/lib/tools/definitions.ts src/lib/chat/orchestrator.ts src/app/api/chat/route.ts src/components/Chat.tsx tests/chat/coachTools.test.ts
git commit -m "feat: coach surface is query-only (no LLM write path)"
```

---

## Final Verification (after all tasks)

- [ ] `npx vitest run` — all suites green (existing 46 + new: streak 6, payload 5, history 3, deleteLast 2, coachTools 1).
- [ ] `npx tsc --noEmit` — clean.
- [ ] `npx eslint .` — clean.
- [ ] Live dogfood loop on :3100: log a workout via chips → insight fires → switch to Coach → ask "이번 주 어땠어?" → correct answer. The full Approach-B loop works end to end.
- [ ] Data contract spot-check in Supabase: structured writes produce byte-identical jsonb keys to the old tool path (`query_logs` still finds them).

## Success Criteria (from design 200231)

- A repeat workout logs in a few taps (어제처럼 반복 / chip → Save); sleep in ~2 taps.
- Structured logs write directly with no LLM call (instant, 0 hallucination) — verified by the builder + route path.
- An insight line appears on every save; cold-start and gap both fall back to committed copy, never a fabricated number.
- Chat no longer writes logs; it answers/advises only.

---

## Self-Review

**1. Spec coverage (design 200231 + 143840):**
- Two surfaces Log/Coach + bottom tabs → Tasks 6, 9, 10. ✅
- Sleep chips + quality toggle + date → Tasks 7, 9. ✅
- Workout hybrid (recent chips, last-value prefill, 어제처럼 반복, + 종목, free text) → Tasks 3, 8. ✅
- POST /api/log, no LLM, RLS via session → Task 5. ✅
- Locked data contract (keys, satisfaction map, duration_min) → Task 2 (enforced) + Task 5 (used). ✅
- computeInsight streak built here as value layer, cold-start + same-day dedup + safe fallback → Task 1. ✅
- Chat-logging removed (query-only coach) → Task 10. ✅
- Delete-last in scope → Task 4 (repo) + Task 5 (DELETE) + Task 9 (undo UI). ✅
- Exercise-name normalization / de-dupe → Task 2 + used in Task 3. ✅
- Save guard (re-entrancy) → Task 9 (`sendingRef`). ✅
- Cold-start (hide chips / 어제처럼 반복 when empty) → Tasks 8 (conditional render) + 1 (cold-start copy). ✅
- No schema change → confirmed (reuses `logs` + `queryLogs`). ✅

**2. Placeholder scan:** No TBD/TODO; every code step has full code; every test step has real assertions. ✅

**3. Type consistency:** `SleepInput`/`WorkoutInput` (payload.ts) consumed identically by SleepLog/WorkoutLog/LogClient/route. `ExercisePrefill`/`WorkoutEntry` (history.ts) consumed by WorkoutLog/LogClient/log page. `deleteLastLog` signature identical across interface, supabase impl, fake, route. `coachToolDefinitions` / `runChat` `tools` param consistent across definitions, orchestrator, chat route, test. ✅

Deferred (per design, not gaps): seeded exercise master list, non-weight exercises (free-text only in v1), richer multi-insight engine, proactive nudge channel.
