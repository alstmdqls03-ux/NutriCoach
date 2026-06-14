# Design: Visual machine picker + experience in onboarding

Date: 2026-06-14
Status: APPROVED (user-directed changes)
Builds on: Bloom coach + onboarding (shipped).

## Three changes

### 1. Machine selection → its own visual picker page
Replace the comma-text machine input on `/coach` with a dedicated **`/coach/machines`** page: an image grid (machine photos from free-exercise-db), grouped by body part, multi-select. Saving writes `profiles.gym_machines` and returns to `/coach`.
- `MACHINE_CATALOG` (`src/lib/coach/catalog.ts`): the 24 curated machines, each `{ id, label, bodyPart }`. `label` is an existing `DEFAULT_MACHINE_ALIASES` key (so `resolveMachine` maps it); `id` builds the image URL `https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/<id>/0.jpg` (verified 200).
- `/coach/machines` (server): reads `gym_machines`, Bloom-themed, mounts `MachinePicker` (client) with the current selection.
- `MachinePicker`: body-part sections; each machine = image card + label + selected check (lime). "저장" → `POST /api/coach/machines { machines: string[] }` → `setGymMachines` → `router.push('/coach')`.
- `/coach` RoutineBuilder: no machine text input. Shows the chosen machines as chips + a "머신 고르기/수정" button → `/coach/machines`. Generate uses the saved machines.

### 2. Experience → onboarding (with height/weight)
Collect training experience during onboarding's **Metrics** step (alongside Height/Weight/Age), not on the coach.
- `MetricsScreen`: add an experience segment (초급/중급/고급) under Age.
- `OnboardData.experience`; `handleOnboarding` persists it; migration `0008` adds `profiles.experience text`.
- `/coach` reads `profile.experience` (fallback `experienceFromActivity(activity_level)` → beginner). RoutineBuilder no longer renders the experience `<select>`; experience is fixed from the profile.

### 3. Self-QA
After building, invoke `/qa` to test the flows.

## Data model (migration 0008)
`alter table profiles add column experience text;` (`'beginner'|'intermediate'|'advanced'`). Additive.

## Files
- `supabase/migrations/0008_profile_experience.sql`
- `src/lib/coach/catalog.ts` (+ test: every label is a valid alias)
- `src/app/api/coach/machines/route.ts` (POST save gym_machines)
- `src/components/coach/MachinePicker.tsx`
- `src/app/coach/machines/page.tsx`
- `src/components/coach/RoutineBuilder.tsx` (remove machine input + exp select; chips + picker button)
- `src/app/coach/page.tsx` (experience from profile)
- `src/components/onboarding/screens.tsx` (experience in Metrics) + `OnboardingFlow` data + `src/lib/onboarding.ts` + repo types/migration
- `src/lib/repositories/types.ts` OnboardingData += experience

## Non-goals
Target-muscle picker (keep text input), machine images beyond the 24 catalog, removing the Activity onboarding step (kept).

## Testing
- `catalog` unit test: every `MACHINE_CATALOG` label resolves via `resolveMachine`; ids exist in the dataset.
- `handleOnboarding` test extended for `experience`.
- `/qa` end-to-end after build.
