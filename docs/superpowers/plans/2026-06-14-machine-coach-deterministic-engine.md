# Machine-Constrained Routine + Progression Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the deterministic, code-only half of the machine-constrained hypertrophy coach: enter your gym's machines + target muscle + experience, get a routine using only those machines, and a next-session load recommendation from your logged history — gym-usable with no RAG.

**Architecture:** Pure TypeScript functions in `src/lib/coach/` (machine-mapping → routine builder → double-progression engine → response assembler), exposed via a `POST /api/coach` route that reads workout history through the existing `LogRepository`, rendered by a thin client form on the existing `/coach` page. Numbers are owned entirely by code (Premise 3 + 5); the `CoachResponse.explanations[]` field ships empty here and is filled by the later RAG plan.

**Tech Stack:** Next.js 14 App Router (TS), Supabase (server client + existing repositories), Vitest. No new DB tables, no pgvector, no LLM in this plan.

---

## Plan Source

Implements `docs/superpowers/specs/2026-06-14-machine-rag-coach-design.md` — the deterministic-engine + machine-mapping scope only. Deferred to Plan 2 (RAG): ingestion, pgvector, retrieval, grounding-verified citations, eval harness, and persisted user-registered aliases (`machine_aliases` table). The two pre-build probes in the spec's "The Assignment" feed the real alias map and corpus *before* Plan 2.

## File Structure

- `src/lib/coach/types.ts` — shared types (`ExerciseRecord`, `ComputedRoutine`, `ComputedProgression`, `Prescription`, `CoachResponse`, …). One responsibility: the contract every other coach unit speaks.
- `src/lib/coach/data/free-exercise-db.json` — vendored `yuhonas/free-exercise-db` dataset (public domain).
- `src/lib/coach/exercises.ts` — load + normalize the dataset into `ExerciseRecord[]`, derive `bodyPart`, expose `getExerciseById`.
- `src/lib/coach/muscles.ts` — Korean target-muscle → free-exercise-db muscle resolution, and lower/upper body classification.
- `src/lib/coach/machineMap.ts` — global Korean alias → exercise-id map + `resolveMachine`.
- `src/lib/coach/routine.ts` — `buildRoutine` (machine-filtered, target-muscle-filtered exercise selection + sets/reps defaults).
- `src/lib/coach/progression.ts` — `nextPrescription` (double progression), `coldStartPrescription`, `lastSessionFor`.
- `src/lib/coach/index.ts` — `buildCoachResponse` assembler.
- `src/app/api/coach/route.ts` — `POST` endpoint, auth + repo wiring.
- `src/components/coach/RoutineBuilder.tsx` — client form + result rendering.
- `src/app/coach/page.tsx` — mount the RoutineBuilder (modify existing page).
- Tests mirror under `tests/coach/` (Vitest, `@/` path alias, `describe/it/expect` per existing house style).

---

## Task 1: Shared types

**Files:**
- Create: `src/lib/coach/types.ts`

No test (type-only module; consumers test behavior).

- [ ] **Step 1: Write the types**

```typescript
// src/lib/coach/types.ts
export type Experience = 'beginner' | 'intermediate' | 'advanced';
export type BodyPart = 'upper' | 'lower';
export type LoadEstimate = 'light' | 'moderate' | 'heavy';

/** A free-exercise-db record, slimmed to what the engine needs. */
export interface ExerciseRecord {
  id: string;               // e.g. 'Leg_Press'
  name: string;             // e.g. 'Leg Press'
  primaryMuscles: string[]; // e.g. ['quadriceps']
  secondaryMuscles: string[];
  equipment: string | null; // e.g. 'machine'
  bodyPart: BodyPart;       // derived from primaryMuscles
}

export interface RoutineExercise {
  exerciseId: string;
  name: string;
  sets: number;
  repRange: [number, number];
}

export interface ComputedRoutine {
  targetMuscle: string;          // the Korean term the user entered
  exercises: RoutineExercise[];  // every entry's machine is in the user's list
}

/** Most recent logged session for one exercise (uniform reps per set, per logs schema). */
export interface SessionLog {
  weight_kg: number;
  reps: number;   // reps achieved per set
  sets: number;
}

export type ProgressionBasis = 'progressed' | 'hold' | 'deload' | 'cold-start';

export interface Prescription {
  exerciseId: string;
  weight_kg: number | null;  // null only for cold-start (no history)
  sets: number;
  repTarget: number;         // reps to aim for this session
  basis: ProgressionBasis;
  note: string;              // Korean one-liner, code-authored (never cited)
}

export interface ComputedProgression {
  prescriptions: Prescription[];
}

/** Citations live here in Plan 2; ships as [] in Plan 1. */
export interface Explanation {
  claim: string;
  chunk_ids: string[];
}

export interface MachineMiss {
  input: string;  // the raw machine name the user typed that didn't map
}

export interface CoachResponse {
  routine: ComputedRoutine;
  progression: ComputedProgression;
  explanations: Explanation[];  // [] in Plan 1
  misses: MachineMiss[];        // unmapped machine names, surfaced not dropped
}

export interface CoachInput {
  machines: string[];      // raw machine names as the user types them
  targetMuscle: string;    // Korean term, e.g. '가슴'
  experience: Experience;
  estimate?: LoadEstimate; // used only for cold-start exercises
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/coach/types.ts
git commit -m "feat(coach): shared types for machine-constrained engine"
```

---

## Task 2: Vendor the free-exercise-db dataset

**Files:**
- Create: `src/lib/coach/data/free-exercise-db.json`

- [ ] **Step 1: Download the dataset (public domain)**

Run:
```bash
mkdir -p src/lib/coach/data
curl -fsSL https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json \
  -o src/lib/coach/data/free-exercise-db.json
```

- [ ] **Step 2: Verify it parsed and has the fields we rely on**

Run:
```bash
node -e "const d=require('./src/lib/coach/data/free-exercise-db.json'); console.log('count', d.length); const s=d.find(x=>x.id); console.log('keys', Object.keys(s)); console.log('sample', JSON.stringify({id:s.id,name:s.name,primaryMuscles:s.primaryMuscles,equipment:s.equipment}));"
```
Expected: `count` ≈ 800+; `keys` includes `id`, `name`, `primaryMuscles`, `secondaryMuscles`, `equipment`. If the field names differ, note the actual names — Task 3's mapping must match them.

- [ ] **Step 3: Commit**

```bash
git add src/lib/coach/data/free-exercise-db.json
git commit -m "chore(coach): vendor yuhonas/free-exercise-db dataset (public domain)"
```

---

## Task 3: Exercise loader + body-part derivation

**Files:**
- Create: `src/lib/coach/exercises.ts`
- Test: `tests/coach/exercises.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/coach/exercises.test.ts
import { describe, it, expect } from 'vitest';
import { toExerciseRecord, loadExercises, getExerciseById } from '@/lib/coach/exercises';

describe('exercise loader', () => {
  it('classifies a leg movement as lower body', () => {
    const rec = toExerciseRecord({
      id: 'Leg_Press', name: 'Leg Press',
      primaryMuscles: ['quadriceps'], secondaryMuscles: ['glutes'], equipment: 'machine',
    });
    expect(rec.bodyPart).toBe('lower');
  });

  it('classifies a chest movement as upper body', () => {
    const rec = toExerciseRecord({
      id: 'Pec_Deck', name: 'Pec Deck',
      primaryMuscles: ['chest'], secondaryMuscles: [], equipment: 'machine',
    });
    expect(rec.bodyPart).toBe('upper');
  });

  it('tolerates missing arrays/equipment', () => {
    const rec = toExerciseRecord({ id: 'X', name: 'X' } as never);
    expect(rec.primaryMuscles).toEqual([]);
    expect(rec.equipment).toBeNull();
    expect(rec.bodyPart).toBe('upper'); // default when unknown
  });

  it('loads the vendored dataset and finds by id', () => {
    const all = loadExercises();
    expect(all.length).toBeGreaterThan(100);
    const byId = getExerciseById(all, all[0].id);
    expect(byId?.id).toBe(all[0].id);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/coach/exercises.test.ts`
Expected: FAIL — module `@/lib/coach/exercises` not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/coach/exercises.ts
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
```

- [ ] **Step 4: Enable JSON import (if tsc complains)**

If `npx tsc --noEmit` reports it cannot import the `.json`, confirm `tsconfig.json` has `"resolveJsonModule": true` (Next.js default sets it; add it under `compilerOptions` if absent). Re-run tsc.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/coach/exercises.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/coach/exercises.ts tests/coach/exercises.test.ts tsconfig.json
git commit -m "feat(coach): exercise loader with body-part derivation"
```

---

## Task 4: Korean target-muscle resolution

**Files:**
- Create: `src/lib/coach/muscles.ts`
- Test: `tests/coach/muscles.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/coach/muscles.test.ts
import { describe, it, expect } from 'vitest';
import { resolveTargetMuscle } from '@/lib/coach/muscles';

describe('resolveTargetMuscle', () => {
  it('maps 가슴 to chest', () => {
    expect(resolveTargetMuscle('가슴')).toContain('chest');
  });
  it('maps 등 to back muscles', () => {
    expect(resolveTargetMuscle('등')).toEqual(expect.arrayContaining(['lats', 'middle back']));
  });
  it('maps 하체 to multiple leg muscles', () => {
    const r = resolveTargetMuscle('하체');
    expect(r).toEqual(expect.arrayContaining(['quadriceps', 'hamstrings', 'glutes']));
  });
  it('trims and tolerates spacing', () => {
    expect(resolveTargetMuscle('  가슴 ')).toContain('chest');
  });
  it('returns [] for an unknown term', () => {
    expect(resolveTargetMuscle('우주')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/coach/muscles.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/coach/muscles.ts

// Korean target term -> free-exercise-db primaryMuscle values.
// Values MUST exist in the dataset's muscle vocabulary (see Task 2 verify step).
const TARGET_MUSCLE_ALIASES: Record<string, string[]> = {
  '가슴': ['chest'],
  '등': ['lats', 'middle back', 'lower back', 'traps'],
  '어깨': ['shoulders'],
  '이두': ['biceps'],
  '삼두': ['triceps'],
  '팔': ['biceps', 'triceps', 'forearms'],
  '하체': ['quadriceps', 'hamstrings', 'glutes', 'calves'],
  '다리': ['quadriceps', 'hamstrings', 'glutes', 'calves'],
  '허벅지': ['quadriceps', 'hamstrings'],
  '둔근': ['glutes'],
  '엉덩이': ['glutes'],
  '햄스트링': ['hamstrings'],
  '종아리': ['calves'],
  '복근': ['abdominals'],
  '코어': ['abdominals'],
};

/** Korean target term -> list of dataset muscle names. [] when unrecognized. */
export function resolveTargetMuscle(korean: string): string[] {
  const key = korean.trim().replace(/\s+/g, ' ');
  return TARGET_MUSCLE_ALIASES[key] ?? [];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/coach/muscles.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/coach/muscles.ts tests/coach/muscles.test.ts
git commit -m "feat(coach): Korean target-muscle resolution"
```

---

## Task 5: Machine-mapping layer

**Files:**
- Create: `src/lib/coach/machineMap.ts`
- Test: `tests/coach/machineMap.test.ts`

This is the layer the spec flags as the #1 risk (Codex challenge to P2). v1 ships a global Korean alias seed; the founder's machine-mapping probe expands `DEFAULT_MACHINE_ALIASES`. A machine that does not resolve is returned as `null` so the caller can surface a `미매핑` note (never silently substituted).

- [ ] **Step 1: Write the failing test**

```typescript
// tests/coach/machineMap.test.ts
import { describe, it, expect } from 'vitest';
import { normalizeMachineName, resolveMachine } from '@/lib/coach/machineMap';

const aliases = { '펙덱': 'Pec_Deck', '시티드로우': 'Seated_Cable_Row', '랫풀다운': 'Lat_Pulldown' };

describe('machine mapping', () => {
  it('normalizes spacing and case', () => {
    expect(normalizeMachineName('  Pec  Deck ')).toBe('pec deck');
  });
  it('resolves a known Korean alias to an exercise id', () => {
    expect(resolveMachine('펙덱', aliases)).toBe('Pec_Deck');
  });
  it('resolves regardless of surrounding spaces', () => {
    expect(resolveMachine(' 시티드로우 ', aliases)).toBe('Seated_Cable_Row');
  });
  it('returns null for an unmapped machine (never guesses)', () => {
    expect(resolveMachine('처음보는머신', aliases)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/coach/machineMap.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/coach/machineMap.ts

export type AliasMap = Record<string, string>; // alias -> exercise id

/** Canonical match key: trimmed, internal whitespace collapsed, lowercased. */
export function normalizeMachineName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

// Global seed. Expand from the founder's machine-mapping probe (spec: The Assignment).
// Every value MUST be a real free-exercise-db id — verify against the vendored JSON.
export const DEFAULT_MACHINE_ALIASES: AliasMap = {
  '펙덱': 'Pec_Deck',
  '체스트프레스': 'Machine_Bench_Press',
  '랫풀다운': 'Lat_Pulldown',
  '시티드로우': 'Seated_Cable_Row',
  '레그프레스': 'Leg_Press',
  '레그익스텐션': 'Leg_Extensions',
  '레그컬': 'Lying_Leg_Curls',
  '숄더프레스': 'Machine_Shoulder_Press',
};

/**
 * Resolve a raw machine name to an exercise id, or null if unmapped.
 * Aliases are matched on the normalized key. null is a signal to the caller to
 * surface a "미매핑" note — never substitute a machine the user doesn't have.
 */
export function resolveMachine(name: string, aliases: AliasMap = DEFAULT_MACHINE_ALIASES): string | null {
  const want = normalizeMachineName(name);
  for (const [alias, id] of Object.entries(aliases)) {
    if (normalizeMachineName(alias) === want) return id;
  }
  return null;
}
```

- [ ] **Step 4: Verify the seed ids exist in the dataset**

Run:
```bash
node -e "const d=require('./src/lib/coach/data/free-exercise-db.json'); const ids=new Set(d.map(x=>x.id)); for (const id of ['Pec_Deck','Machine_Bench_Press','Lat_Pulldown','Seated_Cable_Row','Leg_Press','Leg_Extensions','Lying_Leg_Curls','Machine_Shoulder_Press']) console.log(id, ids.has(id));"
```
Expected: each id prints `true`. For any `false`, open the JSON, find the correct id for that machine (search by name), and fix the value in `DEFAULT_MACHINE_ALIASES`. Do not leave a `false` id — it would silently drop that machine.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/coach/machineMap.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/coach/machineMap.ts tests/coach/machineMap.test.ts
git commit -m "feat(coach): machine-mapping layer with Korean alias seed"
```

---

## Task 6: Routine builder

**Files:**
- Create: `src/lib/coach/routine.ts`
- Test: `tests/coach/routine.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/coach/routine.test.ts
import { describe, it, expect } from 'vitest';
import { buildRoutine } from '@/lib/coach/routine';
import type { ExerciseRecord } from '@/lib/coach/types';

const dataset: ExerciseRecord[] = [
  { id: 'Pec_Deck', name: 'Pec Deck', primaryMuscles: ['chest'], secondaryMuscles: [], equipment: 'machine', bodyPart: 'upper' },
  { id: 'Lat_Pulldown', name: 'Lat Pulldown', primaryMuscles: ['lats'], secondaryMuscles: ['biceps'], equipment: 'cable', bodyPart: 'upper' },
  { id: 'Leg_Press', name: 'Leg Press', primaryMuscles: ['quadriceps'], secondaryMuscles: ['glutes'], equipment: 'machine', bodyPart: 'lower' },
];

describe('buildRoutine', () => {
  it('includes only exercises whose id is in the machine list', () => {
    const r = buildRoutine({ machineIds: ['Pec_Deck'], targetMuscle: '가슴', experience: 'beginner' }, dataset);
    expect(r.exercises.map((e) => e.exerciseId)).toEqual(['Pec_Deck']);
  });

  it('filters by target muscle (등 excludes chest/legs)', () => {
    const r = buildRoutine({ machineIds: ['Pec_Deck', 'Lat_Pulldown', 'Leg_Press'], targetMuscle: '등', experience: 'beginner' }, dataset);
    expect(r.exercises.map((e) => e.exerciseId)).toEqual(['Lat_Pulldown']);
  });

  it('never includes a machine outside the list (core invariant)', () => {
    const r = buildRoutine({ machineIds: ['Lat_Pulldown'], targetMuscle: '하체', experience: 'beginner' }, dataset);
    // 하체 matches Leg_Press, but Leg_Press is not in the machine list -> empty
    expect(r.exercises).toEqual([]);
  });

  it('sets the default rep range and experience-based set count', () => {
    const r = buildRoutine({ machineIds: ['Pec_Deck'], targetMuscle: '가슴', experience: 'intermediate' }, dataset);
    expect(r.exercises[0].repRange).toEqual([8, 12]);
    expect(r.exercises[0].sets).toBe(4); // intermediate
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/coach/routine.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/coach/routine.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/coach/routine.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/coach/routine.ts tests/coach/routine.test.ts
git commit -m "feat(coach): machine + target-muscle filtered routine builder"
```

---

## Task 7: Progression engine (double progression)

**Files:**
- Create: `src/lib/coach/progression.ts`
- Test: `tests/coach/progression.test.ts`

Implements the spec's locked v1 rule. All numbers here are code-owned and never cited.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/coach/progression.test.ts
import { describe, it, expect } from 'vitest';
import { nextPrescription, coldStartPrescription, lastSessionFor } from '@/lib/coach/progression';
import type { LogRow } from '@/lib/repositories/types';

describe('double progression', () => {
  it('bumps weight (+2.5 upper) and resets reps when all sets hit the top', () => {
    const p = nextPrescription('Pec_Deck', { weight_kg: 40, reps: 12, sets: 3 }, [8, 12], 'upper');
    expect(p.weight_kg).toBe(42.5);
    expect(p.repTarget).toBe(8);
    expect(p.sets).toBe(3);
    expect(p.basis).toBe('progressed');
  });

  it('bumps +5 for lower body', () => {
    const p = nextPrescription('Leg_Press', { weight_kg: 100, reps: 12, sets: 3 }, [8, 12], 'lower');
    expect(p.weight_kg).toBe(105);
    expect(p.basis).toBe('progressed');
  });

  it('holds weight and aims for the top when mid-range', () => {
    const p = nextPrescription('Pec_Deck', { weight_kg: 40, reps: 10, sets: 3 }, [8, 12], 'upper');
    expect(p.weight_kg).toBe(40);
    expect(p.repTarget).toBe(12);
    expect(p.basis).toBe('hold');
  });

  it('deloads when every set is below the bottom', () => {
    const p = nextPrescription('Pec_Deck', { weight_kg: 50, reps: 6, sets: 3 }, [8, 12], 'upper');
    expect(p.weight_kg).toBe(47.5);
    expect(p.repTarget).toBe(8);
    expect(p.basis).toBe('deload');
  });

  it('never produces a negative weight on deload', () => {
    const p = nextPrescription('X', { weight_kg: 2, reps: 4, sets: 3 }, [8, 12], 'upper');
    expect(p.weight_kg).toBe(0);
  });

  it('cold start has null weight and the log-first copy', () => {
    const p = coldStartPrescription('Pec_Deck', [8, 12]);
    expect(p.weight_kg).toBeNull();
    expect(p.repTarget).toBe(8);
    expect(p.basis).toBe('cold-start');
    expect(p.note).toMatch(/기록/);
  });
});

describe('lastSessionFor', () => {
  const aliases = { '체스트프레스': 'Machine_Bench_Press' };
  const row = (logged_at: string, data: Record<string, unknown>): LogRow => ({ id: 'x', type: 'workout', data, logged_at });

  it('returns the most recent session whose exercise maps to the id', () => {
    const logs: LogRow[] = [
      row('2026-06-13T10:00:00Z', { exercise: '체스트프레스', weight_kg: 42.5, reps: 9, sets: 3 }),
      row('2026-06-10T10:00:00Z', { exercise: '체스트프레스', weight_kg: 40, reps: 12, sets: 3 }),
    ];
    const s = lastSessionFor('Machine_Bench_Press', logs, aliases);
    expect(s).toEqual({ weight_kg: 42.5, reps: 9, sets: 3 });
  });

  it('returns null when no logged exercise maps to the id', () => {
    const logs: LogRow[] = [row('2026-06-13T10:00:00Z', { exercise: '스쿼트', weight_kg: 60, reps: 10, sets: 3 })];
    expect(lastSessionFor('Machine_Bench_Press', logs, aliases)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/coach/progression.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/coach/progression.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/coach/progression.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/coach/progression.ts tests/coach/progression.test.ts
git commit -m "feat(coach): double-progression engine + history lookup"
```

---

## Task 8: Response assembler

**Files:**
- Create: `src/lib/coach/index.ts`
- Test: `tests/coach/index.test.ts`

Ties the units together: resolve machines (collecting misses), build the routine, and compute a prescription per routine exercise from history (cold-start when absent).

- [ ] **Step 1: Write the failing test**

```typescript
// tests/coach/index.test.ts
import { describe, it, expect } from 'vitest';
import { buildCoachResponse } from '@/lib/coach';
import type { ExerciseRecord } from '@/lib/coach/types';
import type { LogRow } from '@/lib/repositories/types';

const dataset: ExerciseRecord[] = [
  { id: 'Machine_Bench_Press', name: 'Machine Bench Press', primaryMuscles: ['chest'], secondaryMuscles: [], equipment: 'machine', bodyPart: 'upper' },
];
const aliases = { '체스트프레스': 'Machine_Bench_Press' };

describe('buildCoachResponse', () => {
  it('surfaces unmapped machines as misses, never drops them silently', () => {
    const res = buildCoachResponse(
      { machines: ['체스트프레스', '우주머신'], targetMuscle: '가슴', experience: 'beginner' },
      [], dataset, aliases,
    );
    expect(res.misses).toEqual([{ input: '우주머신' }]);
    expect(res.routine.exercises.map((e) => e.exerciseId)).toEqual(['Machine_Bench_Press']);
  });

  it('computes a progressed prescription from history', () => {
    const logs: LogRow[] = [
      { id: 'a', type: 'workout', logged_at: '2026-06-12T10:00:00Z',
        data: { exercise: '체스트프레스', weight_kg: 40, reps: 12, sets: 3 } },
    ];
    const res = buildCoachResponse(
      { machines: ['체스트프레스'], targetMuscle: '가슴', experience: 'beginner' },
      logs, dataset, aliases,
    );
    const p = res.progression.prescriptions[0];
    expect(p.exerciseId).toBe('Machine_Bench_Press');
    expect(p.weight_kg).toBe(42.5);
    expect(p.basis).toBe('progressed');
  });

  it('uses cold-start when an exercise has no history', () => {
    const res = buildCoachResponse(
      { machines: ['체스트프레스'], targetMuscle: '가슴', experience: 'beginner' },
      [], dataset, aliases,
    );
    expect(res.progression.prescriptions[0].basis).toBe('cold-start');
    expect(res.progression.prescriptions[0].weight_kg).toBeNull();
  });

  it('ships explanations empty in Plan 1', () => {
    const res = buildCoachResponse(
      { machines: ['체스트프레스'], targetMuscle: '가슴', experience: 'beginner' },
      [], dataset, aliases,
    );
    expect(res.explanations).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/coach/index.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/coach/index.ts
import type { CoachInput, CoachResponse, ExerciseRecord, MachineMiss, Prescription } from './types';
import { loadExercises, getExerciseById } from './exercises';
import { resolveMachine, DEFAULT_MACHINE_ALIASES, type AliasMap } from './machineMap';
import { buildRoutine } from './routine';
import { coldStartPrescription, lastSessionFor, nextPrescription } from './progression';

export function buildCoachResponse(
  input: CoachInput,
  logs: import('@/lib/repositories/types').LogRow[],
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/coach/index.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the whole coach suite + typecheck**

Run: `npm test -- tests/coach && npx tsc --noEmit`
Expected: all coach tests PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/coach/index.ts tests/coach/index.test.ts
git commit -m "feat(coach): response assembler (routine + progression + misses)"
```

---

## Task 9: API route

**Files:**
- Create: `src/app/api/coach/route.ts`
- Test: `tests/coach/route.test.ts`

Follows the existing `src/app/api/chat/route.ts` pattern: auth via `supabaseServer`, history via `supabaseLogRepository`, validation, JSON response. The handler is factored so the core is unit-testable without Next's request plumbing.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/coach/route.test.ts
import { describe, it, expect } from 'vitest';
import { handleCoach } from '@/app/api/coach/route';
import type { LogRow } from '@/lib/repositories/types';

const fakeLogs = (rows: LogRow[]) => ({
  queryLogs: async () => rows,
  insertLog: async () => {}, deleteLastLog: async () => false,
});

describe('handleCoach', () => {
  it('400s on missing machines', async () => {
    const r = await handleCoach({ body: { targetMuscle: '가슴', experience: 'beginner' }, logs: fakeLogs([]) });
    expect(r.status).toBe(400);
  });

  it('returns a CoachResponse with routine + progression', async () => {
    const logs = fakeLogs([
      { id: 'a', type: 'workout', logged_at: '2026-06-12T10:00:00Z',
        data: { exercise: '체스트프레스', weight_kg: 40, reps: 12, sets: 3 } },
    ]);
    const r = await handleCoach({
      body: { machines: ['체스트프레스'], targetMuscle: '가슴', experience: 'beginner' },
      logs,
    });
    expect(r.status).toBe(200);
    expect(r.body.routine).toBeDefined();
    expect(r.body.progression.prescriptions.length).toBeGreaterThanOrEqual(0);
    expect(r.body.explanations).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/coach/route.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/app/api/coach/route.ts
import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseLogRepository } from '@/lib/repositories/supabaseRepositories';
import type { LogRepository } from '@/lib/repositories/types';
import { buildCoachResponse } from '@/lib/coach';
import type { CoachInput, CoachResponse, Experience } from '@/lib/coach/types';

const EXPERIENCES: Experience[] = ['beginner', 'intermediate', 'advanced'];

export interface CoachHandlerArgs {
  body: unknown;
  logs: LogRepository;
}
export interface CoachHandlerResult {
  status: number;
  body: CoachResponse | { error: string };
}

/** Pure core: validate input, read history, assemble response. Unit-testable. */
export async function handleCoach({ body, logs }: CoachHandlerArgs): Promise<CoachHandlerResult> {
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
  return { status: 200, body: buildCoachResponse(input, history) };
}

export async function POST(req: Request) {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  const user = data.user;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  // The repository is RLS-scoped to the signed-in user; pass the real userId.
  const logs = supabaseLogRepository(sb);
  const scoped: LogRepository = { ...logs, queryLogs: (i) => logs.queryLogs({ ...i, userId: user.id }) };

  try {
    const res = await handleCoach({ body, logs: scoped });
    return NextResponse.json(res.body, { status: res.status });
  } catch (e) {
    console.error('coach error', e);
    return NextResponse.json({ error: '잠시 문제가 생겼어요. 다시 시도해주세요.' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/coach/route.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/coach/route.ts tests/coach/route.test.ts
git commit -m "feat(coach): POST /api/coach route with testable core"
```

---

## Task 10: Routine UI on the /coach page

**Files:**
- Create: `src/components/coach/RoutineBuilder.tsx`
- Modify: `src/app/coach/page.tsx`

The thin surface that makes it gym-usable. UI is verified manually (the project has no React test renderer configured); the logic it calls is already covered by Tasks 3–9.

- [ ] **Step 1: Read the current coach page**

Run: `cat src/app/coach/page.tsx`
Note how it renders (server vs client component) and what already lives there, so the RoutineBuilder is added without removing existing chat UI.

- [ ] **Step 2: Write the RoutineBuilder client component**

```tsx
// src/components/coach/RoutineBuilder.tsx
'use client';
import { useState } from 'react';
import type { CoachResponse, Experience } from '@/lib/coach/types';

const EXPERIENCES: { value: Experience; label: string }[] = [
  { value: 'beginner', label: '초급' },
  { value: 'intermediate', label: '중급' },
  { value: 'advanced', label: '고급' },
];

export function RoutineBuilder() {
  const [machines, setMachines] = useState('');
  const [targetMuscle, setTargetMuscle] = useState('가슴');
  const [experience, setExperience] = useState<Experience>('beginner');
  const [res, setRes] = useState<CoachResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true); setError(null); setRes(null);
    try {
      const r = await fetch('/api/coach', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          machines: machines.split(',').map((s) => s.trim()).filter(Boolean),
          targetMuscle, experience,
        }),
      });
      const body = await r.json();
      if (!r.ok) { setError(body.error ?? '문제가 생겼어요.'); return; }
      setRes(body as CoachResponse);
    } catch {
      setError('네트워크 오류가 발생했어요.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section style={{ display: 'grid', gap: 12, maxWidth: 560 }}>
      <h2>루틴 생성</h2>
      <label>
        내 머신 (쉼표로 구분)
        <input value={machines} onChange={(e) => setMachines(e.target.value)}
          placeholder="펙덱, 랫풀다운, 레그프레스" style={{ width: '100%' }} />
      </label>
      <label>
        타겟 부위
        <input value={targetMuscle} onChange={(e) => setTargetMuscle(e.target.value)} />
      </label>
      <label>
        경험
        <select value={experience} onChange={(e) => setExperience(e.target.value as Experience)}>
          {EXPERIENCES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
        </select>
      </label>
      <button onClick={submit} disabled={loading}>{loading ? '생성 중…' : '루틴 만들기'}</button>

      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      {res && (
        <div style={{ display: 'grid', gap: 8 }}>
          {res.misses.length > 0 && (
            <p style={{ color: '#b26a00' }}>
              미매핑: {res.misses.map((m) => m.input).join(', ')} — 별칭 등록이 필요해요.
            </p>
          )}
          <h3>{res.routine.targetMuscle} 루틴</h3>
          {res.routine.exercises.length === 0 && <p>해당 부위로 매칭된 머신이 없어요.</p>}
          <ul>
            {res.routine.exercises.map((ex) => {
              const p = res.progression.prescriptions.find((x) => x.exerciseId === ex.exerciseId);
              const load = p?.weight_kg == null ? '기록 없음' : `${p.weight_kg}kg`;
              return (
                <li key={ex.exerciseId}>
                  <strong>{ex.name}</strong> — {ex.sets}세트 × {ex.repRange[0]}–{ex.repRange[1]}회
                  <br />
                  <span>다음 세션: {load} · 목표 {p?.repTarget}회</span>
                  {p?.note && <div style={{ fontSize: 13, color: '#555' }}>{p.note}</div>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Mount it on the coach page**

Add the import and render `<RoutineBuilder />` in `src/app/coach/page.tsx` (above or beside the existing content; do not remove what's there). Example edit — adapt to the actual file from Step 1:

```tsx
import { RoutineBuilder } from '@/components/coach/RoutineBuilder';
// ...inside the page's returned JSX, alongside existing content:
<RoutineBuilder />
```

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no type errors; lint clean.

- [ ] **Step 5: Manual gym-usability check**

Run: `npm run dev`, sign in, open `/coach`. Enter `펙덱, 랫풀다운, 레그프레스`, target `가슴`, 초급 → confirm: only chest machines appear, an unmapped name shows a `미매핑` note, and a previously-logged exercise yields a real next-session load (log one first via `/log` if needed). This is the real-use success gate from the spec.

- [ ] **Step 6: Commit**

```bash
git add src/components/coach/RoutineBuilder.tsx src/app/coach/page.tsx
git commit -m "feat(coach): routine builder UI on /coach page"
```

---

## Task 11: Full suite green + final commit

- [ ] **Step 1: Run the entire test suite**

Run: `npm test`
Expected: all tests pass (existing suites + the new `tests/coach/*`).

- [ ] **Step 2: Typecheck the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Confirm the working tree is committed**

Run: `git status`
Expected: clean (every task committed). If anything is uncommitted, commit it with a descriptive message.

---

## Self-Review (completed during planning)

**Spec coverage (deterministic-engine scope):**
- Machine-mapping layer + Korean aliases + miss-behavior (`미매핑` note, never substitute) → Tasks 5, 8, 10. ✓
- Deterministic routine engine (machine-filtered, target-muscle-filtered) → Tasks 4, 6. ✓
- Double-progression rule (8–12, +2.5/+5, hold-or-deload, cold-start) → Task 7. ✓
- `CoachResponse` schema with `routine`/`progression` code-owned and `explanations: []` reserved for RAG → Tasks 1, 8. ✓
- "Numbers never cited" invariant → enforced structurally: no citation field is ever attached to `routine`/`progression`; `explanations` is the only cited array and is empty here. ✓
- Gym-usable real-use gate → Tasks 9, 10 (route + UI), manual check in Task 10 Step 5. ✓
- **Deferred (correctly out of scope, in Plan 2):** pgvector, `rag_chunks`/`exercise_records`/`machine_aliases` tables, ingestion, retrieval, grounding verification, citation rendering, eval harness, persisted user aliases. The vendored dataset is bundled JSON (Task 2), not a DB table — sufficient for the deterministic engine; the RAG plan adds DB-backed records when retrieval needs them.

**Placeholder scan:** none — every code step is complete and runnable.

**Type consistency:** `CoachResponse`/`Prescription`/`SessionLog`/`ExerciseRecord` defined in Task 1 and used unchanged in Tasks 3–10. `resolveMachine`, `buildRoutine`, `nextPrescription`, `lastSessionFor`, `buildCoachResponse`, `handleCoach` signatures are consistent across definition and call sites. `weight_kg: number | null` (cold-start) is handled in the UI render (Task 10).

**Note for the implementer:** this repo's test runner is **Vitest** (`npm test`), not pytest. The global `/ship` workflow's `pytest` step does not apply here — use `npm test`.
