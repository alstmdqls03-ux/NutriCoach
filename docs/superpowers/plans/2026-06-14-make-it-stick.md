# Make It Stick — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the user's gym machine list (no retyping) and let the user register an alias for an unmapped machine in-app, so a `미매핑` machine becomes mappable without a code edit.

**Architecture:** Additive migration (`gym_machines` column on `profiles` + `machine_aliases` table). New repository methods. The `POST /api/coach` route merges global + user aliases before calling the unchanged engine, and persists the submitted machine list. Two small routes (`GET /api/coach/exercises`, `POST /api/coach/aliases`) back the body-part-filtered alias picker in `RoutineBuilder`.

**Tech Stack:** Next.js 14 App Router (TS), Supabase (Postgres + RLS), Vitest. No engine changes, no pgvector.

---

## Plan Source

Implements `docs/superpowers/specs/2026-06-14-make-it-stick-design.md`.

## File Structure

- `supabase/migrations/0003_coach_make_it_stick.sql` — add `profiles.gym_machines`, create `machine_aliases` + RLS.
- `src/lib/repositories/types.ts` — extend `ProfileRepository`, add `MachineAliasRepository` + `AliasRow`. (Modify)
- `src/lib/repositories/supabaseRepositories.ts` — implement the new methods. (Modify)
- `src/lib/coach/aliasPicker.ts` — `candidateMachineExercises(muscle, dataset)` pure function.
- `src/app/api/coach/exercises/route.ts` — `GET` candidate exercises for a muscle.
- `src/app/api/coach/aliases/route.ts` — `POST` register an alias.
- `src/app/api/coach/route.ts` — merge user aliases + persist machine list. (Modify)
- `src/components/coach/RoutineBuilder.tsx` — `initialMachines` prop + inline 별칭 등록 form. (Modify)
- `src/app/coach/page.tsx` — read `gym_machines`, pass to `RoutineBuilder`. (Modify)
- Tests under `tests/coach/`.

---

## Task 1: Migration — gym_machines column + machine_aliases table

**Files:**
- Create: `supabase/migrations/0003_coach_make_it_stick.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Make-it-stick: persist a user's gym machine list and their custom machine
-- aliases. Additive and non-destructive (see 2026-06-14-make-it-stick-design.md).

-- 1) Persisted gym machine list on the profile.
alter table public.profiles
  add column gym_machines text[] not null default '{}';

-- 2) User-registered machine aliases (alias -> free-exercise-db exercise id).
create table public.machine_aliases (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  alias       text not null,        -- stored normalized (trim+collapse+lower)
  exercise_id text not null,
  created_at  timestamptz not null default now(),
  unique (user_id, alias)
);
create index machine_aliases_user_idx on public.machine_aliases (user_id);

alter table public.machine_aliases enable row level security;
create policy "own aliases" on public.machine_aliases
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```

- [ ] **Step 2: Apply the migration to the Supabase project**

Apply via the Supabase MCP `apply_migration` tool (name: `0003_coach_make_it_stick`) OR, if using the CLI, `supabase db push`. Then verify:

Run (MCP `list_tables` or SQL): confirm `machine_aliases` exists and `profiles` has a `gym_machines` column.
Expected: both present; `machine_aliases` shows RLS enabled.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0003_coach_make_it_stick.sql
git commit -m "feat(coach): migration for gym_machines + machine_aliases"
```

---

## Task 2: Repository types

**Files:**
- Modify: `src/lib/repositories/types.ts`

No standalone test (interfaces; behavior tested via the Supabase impl + route tests).

- [ ] **Step 1: Extend ProfileRepository and add MachineAliasRepository**

Add to `ProfileRepository` (after `setRollingSummary`):

```typescript
  getGymMachines(userId: string): Promise<string[]>;
  setGymMachines(userId: string, machines: string[]): Promise<void>;
```

Add these new exports at the end of the file:

```typescript
export interface AliasRow {
  id: string;
  alias: string;
  exercise_id: string;
}

export interface MachineAliasRepository {
  listAliases(userId: string): Promise<AliasRow[]>;
  addAlias(userId: string, alias: string, exerciseId: string): Promise<void>;
  removeAlias(userId: string, id: string): Promise<void>;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: errors ONLY in `supabaseRepositories.ts` (ProfileRepository now missing the two new methods) — that is fixed in Task 3. If errors appear elsewhere, address them.

- [ ] **Step 3: Commit**

```bash
git add src/lib/repositories/types.ts
git commit -m "feat(coach): repository types for gym list + aliases"
```

---

## Task 3: Supabase repository implementations

**Files:**
- Modify: `src/lib/repositories/supabaseRepositories.ts`

- [ ] **Step 1: Add gym-list methods to supabaseProfileRepository**

Inside the object returned by `supabaseProfileRepository`, after `setRollingSummary`, add:

```typescript
    async getGymMachines(userId): Promise<string[]> {
      const { data, error } = await sb.from('profiles')
        .select('gym_machines').eq('id', userId).maybeSingle();
      if (error) throw new Error(`getGymMachines failed: ${error.message}`);
      return (data?.gym_machines as string[] | null) ?? [];
    },
    async setGymMachines(userId, machines) {
      const { error } = await sb.from('profiles')
        .update({ gym_machines: machines }).eq('id', userId);
      if (error) throw new Error(`setGymMachines failed: ${error.message}`);
    },
```

- [ ] **Step 2: Add the MachineAliasRepository factory**

Append a new exported factory (the file already imports the repo types; add `MachineAliasRepository, AliasRow` to that import):

```typescript
export function supabaseMachineAliasRepository(sb: SupabaseClient): MachineAliasRepository {
  return {
    async listAliases(userId): Promise<AliasRow[]> {
      const { data, error } = await sb.from('machine_aliases')
        .select('id,alias,exercise_id').eq('user_id', userId);
      if (error) throw new Error(`listAliases failed: ${error.message}`);
      return (data ?? []) as AliasRow[];
    },
    async addAlias(userId, alias, exerciseId) {
      const { error } = await sb.from('machine_aliases')
        .upsert({ user_id: userId, alias, exercise_id: exerciseId },
                { onConflict: 'user_id,alias' });
      if (error) throw new Error(`addAlias failed: ${error.message}`);
    },
    async removeAlias(userId, id) {
      const { error } = await sb.from('machine_aliases')
        .delete().eq('user_id', userId).eq('id', id);
      if (error) throw new Error(`removeAlias failed: ${error.message}`);
    },
  };
}
```

Update the existing import near the top of the file:

```typescript
import type {
  LogRepository, MessageRepository, ProfileRepository,
  InsertLogInput, QueryLogInput, LogRow, StoredMessage,
  MachineAliasRepository, AliasRow,
} from './types';
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/repositories/supabaseRepositories.ts
git commit -m "feat(coach): Supabase impls for gym list + alias repository"
```

---

## Task 4: candidateMachineExercises pure function

**Files:**
- Create: `src/lib/coach/aliasPicker.ts`
- Test: `tests/coach/aliasPicker.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/coach/aliasPicker.test.ts
import { describe, it, expect } from 'vitest';
import { candidateMachineExercises } from '@/lib/coach/aliasPicker';
import type { ExerciseRecord } from '@/lib/coach/types';

const dataset: ExerciseRecord[] = [
  { id: 'Butterfly', name: 'Butterfly', primaryMuscles: ['chest'], secondaryMuscles: [], equipment: 'machine', bodyPart: 'upper' },
  { id: 'Cable_Chest_Press', name: 'Cable Chest Press', primaryMuscles: ['chest'], secondaryMuscles: [], equipment: 'cable', bodyPart: 'upper' },
  { id: 'Dumbbell_Flyes', name: 'Dumbbell Flyes', primaryMuscles: ['chest'], secondaryMuscles: [], equipment: 'dumbbell', bodyPart: 'upper' },
  { id: 'Leg_Press', name: 'Leg Press', primaryMuscles: ['quadriceps'], secondaryMuscles: [], equipment: 'machine', bodyPart: 'lower' },
];

describe('candidateMachineExercises', () => {
  it('returns machine/cable exercises for the muscle, excluding free weights', () => {
    const r = candidateMachineExercises('가슴', dataset);
    expect(r.map((e) => e.id)).toEqual(['Butterfly', 'Cable_Chest_Press']);
  });
  it('returns {id,name} pairs only', () => {
    const r = candidateMachineExercises('가슴', dataset);
    expect(r[0]).toEqual({ id: 'Butterfly', name: 'Butterfly' });
  });
  it('excludes other muscle groups', () => {
    const r = candidateMachineExercises('가슴', dataset);
    expect(r.find((e) => e.id === 'Leg_Press')).toBeUndefined();
  });
  it('returns [] for an unknown muscle term', () => {
    expect(candidateMachineExercises('우주', dataset)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/coach/aliasPicker.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/coach/aliasPicker.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/coach/aliasPicker.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/coach/aliasPicker.ts tests/coach/aliasPicker.test.ts
git commit -m "feat(coach): candidateMachineExercises for the alias picker"
```

---

## Task 5: GET /api/coach/exercises route

**Files:**
- Create: `src/app/api/coach/exercises/route.ts`
- Test: `tests/coach/exercisesRoute.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/coach/exercisesRoute.test.ts
import { describe, it, expect } from 'vitest';
import { handleExercises } from '@/app/api/coach/exercises/route';

describe('handleExercises', () => {
  it('400s when muscle is missing', () => {
    expect(handleExercises(null).status).toBe(400);
  });
  it('returns choices for a known muscle', () => {
    const r = handleExercises('가슴');
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body) && r.body.length).toBeGreaterThan(0);
    if (Array.isArray(r.body)) expect(r.body[0]).toHaveProperty('id');
  });
  it('returns an empty list for an unknown muscle', () => {
    const r = handleExercises('우주');
    expect(r.status).toBe(200);
    expect(r.body).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/coach/exercisesRoute.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/app/api/coach/exercises/route.ts
import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { loadExercises } from '@/lib/coach/exercises';
import { candidateMachineExercises, type ExerciseChoice } from '@/lib/coach/aliasPicker';

export interface ExercisesResult {
  status: number;
  body: ExerciseChoice[] | { error: string };
}

/** Pure core: muscle term -> candidate machine/cable exercises. */
export function handleExercises(muscle: string | null): ExercisesResult {
  if (!muscle) return { status: 400, body: { error: 'muscle required' } };
  return { status: 200, body: candidateMachineExercises(muscle, loadExercises()) };
}

export async function GET(req: Request) {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  if (!data.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const muscle = new URL(req.url).searchParams.get('muscle');
  const res = handleExercises(muscle);
  return NextResponse.json(res.body, { status: res.status });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/coach/exercisesRoute.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/coach/exercises/route.ts tests/coach/exercisesRoute.test.ts
git commit -m "feat(coach): GET /api/coach/exercises candidate picker route"
```

---

## Task 6: POST /api/coach/aliases route

**Files:**
- Create: `src/app/api/coach/aliases/route.ts`
- Test: `tests/coach/aliasesRoute.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/coach/aliasesRoute.test.ts
import { describe, it, expect } from 'vitest';
import { handleAddAlias } from '@/app/api/coach/aliases/route';

const fakeAliases = () => {
  const added: { alias: string; exerciseId: string }[] = [];
  return {
    repo: {
      listAliases: async () => [],
      addAlias: async (_u: string, alias: string, exerciseId: string) => { added.push({ alias, exerciseId }); },
      removeAlias: async () => {},
    },
    added,
  };
};

describe('handleAddAlias', () => {
  it('400s on empty alias', async () => {
    const { repo } = fakeAliases();
    const r = await handleAddAlias({ body: { alias: '  ', exerciseId: 'Butterfly' }, aliases: repo });
    expect(r.status).toBe(400);
  });
  it('400s when exerciseId is not in the dataset', async () => {
    const { repo } = fakeAliases();
    const r = await handleAddAlias({ body: { alias: '펙덱기계', exerciseId: 'Not_Real' }, aliases: repo });
    expect(r.status).toBe(400);
  });
  it('adds a normalized alias for a valid exercise', async () => {
    const { repo, added } = fakeAliases();
    const r = await handleAddAlias({ body: { alias: '  내 펙덱 ', exerciseId: 'Butterfly' }, aliases: repo });
    expect(r.status).toBe(200);
    expect(added[0]).toEqual({ alias: '내 펙덱', exerciseId: 'Butterfly' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/coach/aliasesRoute.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/app/api/coach/aliases/route.ts
import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseMachineAliasRepository } from '@/lib/repositories/supabaseRepositories';
import type { MachineAliasRepository } from '@/lib/repositories/types';
import { loadExercises } from '@/lib/coach/exercises';
import { normalizeMachineName } from '@/lib/coach/machineMap';

export interface AddAliasArgs {
  body: unknown;
  aliases: MachineAliasRepository;
}
export interface AddAliasResult {
  status: number;
  body: { ok: true } | { error: string };
}

/** Pure core: validate + persist a user alias. */
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

export async function POST(req: Request) {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  const user = data.user;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const base = supabaseMachineAliasRepository(sb);
  // RLS-scope addAlias to the signed-in user.
  const scoped: MachineAliasRepository = {
    ...base,
    addAlias: (_u, alias, exerciseId) => base.addAlias(user.id, alias, exerciseId),
  };
  const res = await handleAddAlias({ body, aliases: scoped });
  return NextResponse.json(res.body, { status: res.status });
}
```

Note: `handleAddAlias` is called in the test with a fake repo whose `addAlias` ignores the user id; in production the `scoped` wrapper substitutes the real `user.id`. The `'_self'` placeholder is never used against the real DB.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/coach/aliasesRoute.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/coach/aliases/route.ts tests/coach/aliasesRoute.test.ts
git commit -m "feat(coach): POST /api/coach/aliases registration route"
```

---

## Task 7: Merge user aliases + persist machine list in POST /api/coach

**Files:**
- Modify: `src/app/api/coach/route.ts`
- Test: `tests/coach/route.test.ts` (extend)

- [ ] **Step 1: Extend the route test**

Replace the contents of `tests/coach/route.test.ts` with:

```typescript
import { describe, it, expect } from 'vitest';
import { handleCoach } from '@/app/api/coach/route';
import { DEFAULT_MACHINE_ALIASES } from '@/lib/coach/machineMap';
import type { LogRow } from '@/lib/repositories/types';

const fakeLogs = (rows: LogRow[]) => ({
  queryLogs: async () => rows,
  insertLog: async () => {}, deleteLastLog: async () => false,
});

describe('handleCoach', () => {
  it('400s on missing machines', async () => {
    const r = await handleCoach({ body: { targetMuscle: '가슴', experience: 'beginner' }, logs: fakeLogs([]), aliases: { ...DEFAULT_MACHINE_ALIASES } });
    expect(r.status).toBe(400);
  });

  it('returns a CoachResponse with routine + progression', async () => {
    const logs = fakeLogs([
      { id: 'a', type: 'workout', logged_at: '2026-06-12T10:00:00Z',
        data: { exercise: '체스트프레스', weight_kg: 40, reps: 12, sets: 3 } },
    ]);
    const r = await handleCoach({
      body: { machines: ['체스트프레스'], targetMuscle: '가슴', experience: 'beginner' },
      logs, aliases: { ...DEFAULT_MACHINE_ALIASES },
    });
    expect(r.status).toBe(200);
    expect('routine' in r.body && r.body.routine).toBeDefined();
    expect('explanations' in r.body && r.body.explanations).toEqual([]);
  });

  it('a user alias maps a machine the global seed misses', async () => {
    const r = await handleCoach({
      body: { machines: ['내펙덱'], targetMuscle: '가슴', experience: 'beginner' },
      logs: fakeLogs([]),
      aliases: { ...DEFAULT_MACHINE_ALIASES, '내펙덱': 'Butterfly' },
    });
    expect(r.status).toBe(200);
    if ('misses' in r.body) {
      expect(r.body.misses).toEqual([]);
      expect(r.body.routine.exercises.map((e) => e.exerciseId)).toContain('Butterfly');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/coach/route.test.ts`
Expected: FAIL — `handleCoach` does not yet accept an `aliases` arg.

- [ ] **Step 3: Update handleCoach + POST to merge aliases and persist the list**

In `src/app/api/coach/route.ts`:

Update imports:

```typescript
import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import {
  supabaseLogRepository, supabaseProfileRepository, supabaseMachineAliasRepository,
} from '@/lib/repositories/supabaseRepositories';
import type { LogRepository } from '@/lib/repositories/types';
import { buildCoachResponse } from '@/lib/coach';
import { DEFAULT_MACHINE_ALIASES, type AliasMap } from '@/lib/coach/machineMap';
import type { CoachInput, CoachResponse, Experience } from '@/lib/coach/types';
```

Change `CoachHandlerArgs` and `handleCoach` to take an `aliases` map and use it:

```typescript
export interface CoachHandlerArgs {
  body: unknown;
  logs: LogRepository;
  aliases: AliasMap;
}
```

Inside `handleCoach`, change the final lines from the single-arg `buildCoachResponse(input, history)` to:

```typescript
  const history = await logs.queryLogs({ userId: '_self', type: 'workout' });
  return { status: 200, body: buildCoachResponse(input, history, undefined, args.aliases) };
```

(Capture `args` by renaming the destructure to `export async function handleCoach(args: CoachHandlerArgs): Promise<CoachHandlerResult> { const { body, logs } = args; ...}`. `buildCoachResponse`'s 3rd param is `dataset` — pass `undefined` to keep the default vendored dataset, and the 4th is the merged `aliases`.)

Update `POST` to load user aliases, persist the machine list, and pass the merged map:

```typescript
export async function POST(req: Request) {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  const user = data.user;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const logs = supabaseLogRepository(sb);
  const scoped: LogRepository = { ...logs, queryLogs: (i) => logs.queryLogs({ ...i, userId: user.id }) };

  try {
    const userAliases = await supabaseMachineAliasRepository(sb).listAliases(user.id);
    const aliases: AliasMap = { ...DEFAULT_MACHINE_ALIASES };
    for (const a of userAliases) aliases[a.alias] = a.exercise_id;

    const res = await handleCoach({ body, logs: scoped, aliases });

    // Persist the gym list the user just used (best-effort; never blocks the response).
    const b = (body ?? {}) as Record<string, unknown>;
    if (res.status === 200 && Array.isArray(b.machines)) {
      const machines = b.machines.filter((m): m is string => typeof m === 'string');
      await supabaseProfileRepository(sb).setGymMachines(user.id, machines).catch(() => {});
    }
    return NextResponse.json(res.body, { status: res.status });
  } catch (e) {
    console.error('coach error', e);
    return NextResponse.json({ error: '잠시 문제가 생겼어요. 다시 시도해주세요.' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/coach/route.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/coach/route.ts tests/coach/route.test.ts
git commit -m "feat(coach): merge user aliases + persist gym list in /api/coach"
```

---

## Task 8: RoutineBuilder — prefill + inline 별칭 등록

**Files:**
- Modify: `src/components/coach/RoutineBuilder.tsx`
- Modify: `src/app/coach/page.tsx`

UI verified manually; the logic it calls is covered by Tasks 4–7.

- [ ] **Step 1: Add the initialMachines prop + alias form to RoutineBuilder**

Replace `src/components/coach/RoutineBuilder.tsx` with:

```tsx
'use client';
import { useState } from 'react';
import type { CoachResponse, Experience } from '@/lib/coach/types';

const EXPERIENCES: { value: Experience; label: string }[] = [
  { value: 'beginner', label: '초급' },
  { value: 'intermediate', label: '중급' },
  { value: 'advanced', label: '고급' },
];

// Korean body-part terms offered in the alias picker (keys of the target-muscle map).
const BODY_PARTS = ['가슴', '등', '어깨', '이두', '삼두', '하체', '둔근', '복근'];

interface Choice { id: string; name: string; }

export function RoutineBuilder({ initialMachines = [] }: { initialMachines?: string[] }) {
  const [machines, setMachines] = useState(initialMachines.join(', '));
  const [targetMuscle, setTargetMuscle] = useState('가슴');
  const [experience, setExperience] = useState<Experience>('beginner');
  const [res, setRes] = useState<CoachResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function generate(machineList: string[]) {
    setLoading(true); setError(null);
    try {
      const r = await fetch('/api/coach', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ machines: machineList, targetMuscle, experience }),
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

  function submit() {
    setRes(null);
    generate(machines.split(',').map((s) => s.trim()).filter(Boolean));
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
          {res.misses.map((m) => (
            <AliasForm key={m.input} alias={m.input}
              onRegistered={() => generate(machines.split(',').map((s) => s.trim()).filter(Boolean))} />
          ))}
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

function AliasForm({ alias, onRegistered }: { alias: string; onRegistered: () => void }) {
  const [muscle, setMuscle] = useState('');
  const [choices, setChoices] = useState<Choice[]>([]);
  const [exerciseId, setExerciseId] = useState('');
  const [busy, setBusy] = useState(false);

  async function loadChoices(m: string) {
    setMuscle(m); setExerciseId(''); setChoices([]);
    if (!m) return;
    const r = await fetch(`/api/coach/exercises?muscle=${encodeURIComponent(m)}`);
    if (r.ok) setChoices(await r.json());
  }

  async function register() {
    if (!exerciseId) return;
    setBusy(true);
    try {
      const r = await fetch('/api/coach/aliases', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ alias, exerciseId }),
      });
      if (r.ok) onRegistered();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ color: '#b26a00', border: '1px solid #f0d9b5', padding: 8, borderRadius: 6 }}>
      <div>미매핑: <strong>{alias}</strong> — 별칭 등록</div>
      <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
        <select value={muscle} onChange={(e) => loadChoices(e.target.value)}>
          <option value="">부위 선택</option>
          {BODY_PARTS.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <select value={exerciseId} onChange={(e) => setExerciseId(e.target.value)} disabled={choices.length === 0}>
          <option value="">기구 선택</option>
          {choices.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button onClick={register} disabled={!exerciseId || busy}>{busy ? '등록 중…' : '등록'}</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Pass the saved gym list from the coach page**

In `src/app/coach/page.tsx`, after the existing `user` check, read the saved list and pass it. Add near the other queries:

```tsx
  const { data: profile } = await sb
    .from('profiles').select('gym_machines').eq('id', user.id).maybeSingle();
  const initialMachines = (profile?.gym_machines as string[] | null) ?? [];
```

Then change the render to:

```tsx
  return (<><RoutineBuilder initialMachines={initialMachines} /><Chat initialTurns={initialTurns} /><TabBar /></>);
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no type errors; lint clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/coach/RoutineBuilder.tsx src/app/coach/page.tsx
git commit -m "feat(coach): prefill gym list + inline 별칭 등록 form"
```

---

## Task 9: Full suite green + end-to-end check

- [ ] **Step 1: Run the entire test suite**

Run: `npm test`
Expected: all tests pass (existing + new `tests/coach/aliasPicker`, `exercisesRoute`, `aliasesRoute`, extended `route`).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual end-to-end (browser)**

`npm run dev`, sign in, open `/coach`:
- Generate a routine including an unmapped name (e.g. `우주머신`). Confirm the 미매핑 row shows a 부위 선택 → 기구 선택 → 등록 flow. Register it, confirm the routine re-generates and the machine now appears.
- Reload `/coach`. Confirm the machine input is pre-filled with the last-used list.

- [ ] **Step 4: Confirm the working tree is committed**

Run: `git status`
Expected: clean (ignoring pre-existing untracked `.claude/`, `scripts/`).

---

## Self-Review (completed during planning)

**Spec coverage:**
- Persist gym list (`gym_machines` column, repo methods, prefill, auto-save) → Tasks 1, 2, 3, 7, 8. ✓
- `machine_aliases` table + RLS + repository → Tasks 1, 2, 3. ✓
- Merge global + user aliases (user wins), engine unchanged → Task 7. ✓
- `GET /api/coach/exercises` (body-part filtered) → Tasks 4, 5. ✓
- `POST /api/coach/aliases` (validated) → Task 6. ✓
- Body-part-filtered picker UI + re-generate → Task 8. ✓

**Placeholder scan:** none — every code step is complete.

**Type consistency:** `AliasRow`, `MachineAliasRepository`, `ExerciseChoice`, `AliasMap`, `CoachHandlerArgs.aliases` are defined once and used consistently. `buildCoachResponse(input, history, dataset?, aliases?)` already exists from Plan 1 — Task 7 passes `undefined` for dataset and the merged map for aliases (no signature change). `normalizeMachineName` (from Plan 1) is reused for alias normalization so stored aliases match `resolveMachine`'s lookup key.

**Migration note:** Task 1 Step 2 applies the migration to the live Supabase project via MCP `apply_migration`. The end-to-end check (Task 9) exercises it.

