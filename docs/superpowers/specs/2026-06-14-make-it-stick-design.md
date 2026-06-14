# Design: Make it stick — persist gym list + user alias registration

Date: 2026-06-14
Status: APPROVED
Builds on: `2026-06-14-machine-rag-coach-design.md` (Plan 1 deterministic engine, now merged to main). This is a product-depth follow-up that makes the engine usable daily; it is independent of the RAG layer (Plan 2).

## Problem

The deterministic coach works (verified end-to-end), but two friction points keep it a demo:
1. The gym machine list is retyped on every visit — nothing is persisted.
2. A `미매핑: <machine>` note has no action behind it. The user sees the machine was dropped but cannot fix it in the app; only a code edit to `DEFAULT_MACHINE_ALIASES` maps it.

Both are the difference between "demo" and "I open it at the gym." This feature closes that loop.

## Decision

Two additive pieces, one migration, no change to the engine's pure functions (the engine already takes an injectable `AliasMap`).

### Piece 1 — Persist the gym machine list

- **Migration:** add `gym_machines text[] not null default '{}'` to `profiles`. RLS "own profile" already covers new columns.
- **Repository:** `ProfileRepository` gains `getGymMachines(userId): Promise<string[]>` and `setGymMachines(userId, machines: string[]): Promise<void>`.
- **Prefill:** the `/coach` server component reads `gym_machines` and passes it to `RoutineBuilder` as an `initialMachines` prop; the input is pre-filled on load.
- **Auto-save:** the `POST /api/coach` handler persists the submitted `machines` to the profile after building the response (the list you used is the list you have). No separate save button.

### Piece 2 — 별칭 등록 (user-registered aliases)

- **Migration:** new table
  ```
  machine_aliases (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references auth.users(id) on delete cascade,
    alias       text not null,        -- stored normalized (trim+collapse+lower)
    exercise_id text not null,
    created_at  timestamptz not null default now()
  )
  ```
  - index on `(user_id)`; unique `(user_id, alias)` to prevent duplicate aliases.
  - RLS: enable + policy "own aliases" `user_id = auth.uid()` (for all).
- **Repository:** new `MachineAliasRepository` with `listAliases(userId): Promise<AliasRow[]>`, `addAlias(userId, alias, exerciseId): Promise<void>`, `removeAlias(userId, id): Promise<void>`, where `AliasRow = { id, alias, exercise_id }`.
- **Merge at request time:** `POST /api/coach` builds `mergedAliases = { ...DEFAULT_MACHINE_ALIASES, ...userAliasMap }` (user wins on conflict) from `listAliases`, and passes it to `buildCoachResponse(input, history, dataset, mergedAliases)`. `resolveMachine` normalizes keys, so storing the raw-normalized alias is safe. The engine code is unchanged.
- **Candidate-exercise endpoint:** `GET /api/coach/exercises?muscle=<korean>` returns `[{ id, name }]` for exercises whose `primaryMuscles` intersect `resolveTargetMuscle(muscle)` and whose `equipment` is `machine` or `cable`. Backed by a pure `candidateMachineExercises(muscle, dataset)`.
- **Alias endpoint:** `POST /api/coach/aliases` with `{ alias, exerciseId }` → `addAlias`. Validates `exerciseId` exists in the dataset and `alias` is non-empty.

### UI (RoutineBuilder)

- Accepts `initialMachines: string[]`, pre-fills the machine input.
- For each `미매핑` entry, render an inline **별칭 등록** form:
  1. Body-part `<select>` of Korean terms (가슴/등/어깨/하체/…) — the keys of the target-muscle alias map.
  2. On body-part change, `fetch('/api/coach/exercises?muscle=<term>')` → populate an exercise `<select>` of `{id → name}`.
  3. 등록 button → `POST /api/coach/aliases { alias: miss.input, exerciseId }` → on success, re-run the routine generation (the machine now maps).

## Data flow

`/coach` (server) reads `gym_machines` → `RoutineBuilder` pre-filled → user generates → `POST /api/coach` merges global+user aliases, builds response, **persists machines** → render. On a miss, the inline form calls `GET …/exercises` then `POST …/aliases`, then re-generates.

## Scope / non-goals

- One migration `0003_coach_make_it_stick.sql`, additive and non-destructive.
- No change to the engine's pure functions (`resolveMachine`, `buildRoutine`, `nextPrescription`, `buildCoachResponse` signatures unchanged — they already accept `AliasMap`/`dataset`).
- Not in scope: editing/removing aliases from the UI (repository has `removeAlias`, but no UI button in v1), global alias promotion, fuzzy matching, the RAG layer.

## Testing

- `candidateMachineExercises` — pure unit tests (muscle filter + equipment filter + Korean term resolution).
- `POST /api/coach/aliases` handler core — validation (bad exerciseId rejected, empty alias rejected).
- `GET /api/coach/exercises` handler core — returns filtered list, empty for unknown muscle.
- Merged-alias behavior in `handleCoach` — a user alias maps a name the global seed misses; user alias wins on conflict.
- Profile gym-list round-trip via a fake repository in the route test.
- End-to-end (browser): prefill on reload, register an alias for a 미매핑 machine, confirm it then maps.

## Migration safety

Additive only: new column with a default, new table. Existing readers (`computeStreakInsight`, `query_logs`, Plan-1 engine) are unaffected. pgvector not required (that is Plan 2).
