# Design: Bloom onboarding flow

Date: 2026-06-14
Status: APPROVED (design from Claude Design handoff "Bloom Fitness"; scope confirmed = onboarding flow only)
Source: `app-onboarding` handoff bundle (Bloom Signup Flow.html + screens.jsx + icons.jsx). Implement the visual + interaction spec in NutriCoach's Next.js stack; do not copy the prototype's in-browser Babel/iOS-frame scaffolding.

## Scope

Implement the **8-step onboarding/signup flow** only. NOT the 5-tab Bloom app. Keep the NutriCoach name; adopt the Bloom **visual system** scoped to the onboarding route. Email signup wired to Supabase; Apple/Google shown but disabled ("준비 중"). Collected profile data persisted via an additive migration.

## Visual system (from the handoff tokens)

Scoped to a `.bloom` wrapper (CSS custom properties), dark neutral tone + lime accent, Hanken Grotesk:

```
--bg:#121214  --bg-elev:#1D1D20  --bg-elev2:#27272B
--hair:rgba(255,255,255,.10)  --track:rgba(255,255,255,.12)
--text:#F2F2F4  --text-2:#AEAEB4  --text-3:#79797F
--accent:#D7F26A  --accent-ink:#1B2207  --accent-soft:rgba(215,242,106,.10)
--r-card:22px  --r-btn:18px
```

Font: Hanken Grotesk (next/font/google, weights 400–800). On web the flow renders as a centered mobile column (max-width ~430px) on a dark background — no iOS bezel (handoff says remove for production).

## Screens (8) — faithful to screens.jsx

1. **Welcome** — Bloom leaf mark, "Bloom", tagline, "Get started" (→2), "I already have an account" (→ `/login`).
2. **Auth** — Apple/Google rows (disabled, "준비 중"), "Continue with email" → reveals email + password inputs + "Create account" → `supabaseBrowser().auth.signUp`. On session → step 3. On error → inline message (e.g. already registered → link to `/login`).
3. **Name** — large underlined text input, Enter/Continue.
4. **Goals** — 2×3 multi-select cards (lose/muscle/active/endurance/stress/eat), ≥1 to continue. Progress bar 1/4.
5. **Metrics** — Metric/Imperial segment, Height/Weight NumInput, Age stepper. Progress 3/4.
6. **Activity** — 4 radio rows (start/light/moderate/very) with bar glyphs. Progress 4/4.
7. **Notify** — bell hero + "Turn on reminders" / "Maybe later" (both → step 8; no real web push in v1). The iOS-style alert is kept as a visual confirm.
8. **Done** — check mark, "You're all set, {name}!", "Start moving" → save profile → `/coach`.

Progress bar (4 segments) shows on the four data steps (name/goals/metrics/activity), matching `PROG`. Back button returns one step.

## State + persistence

A client `OnboardingFlow` controller holds `{ step, data }`. `data` = `{ name, goals[], units, heightCm, weightKg, heightIn, weightLb, age, activity }`. Persisted to `localStorage['nutricoach_onboarding_v1']` so refresh resumes (matches the design's localStorage behavior). Cleared on completion.

## Data model (migration 0007)

Additive columns on `profiles` (all nullable):
```
display_name   text
goals          text[]
units          text       -- 'Metric' | 'Imperial'
height_cm      int
weight_kg      numeric
age            int
activity_level text       -- 'start'|'light'|'moderate'|'very'
```
No new table. RLS "own profile" already covers new columns.

## Save on completion

`POST /api/onboarding` (authenticated): validates + writes the collected fields to the caller's `profiles` row via `setOnboarding(userId, data)` on `ProfileRepository`. Then the client redirects to `/coach`. (Self-contained: this build stores the data; wiring `activity_level → RoutineBuilder experience default` is a noted follow-up, out of scope here.)

## Entry point

Add a "처음이신가요? 시작하기" link on `/login` → `/onboarding`, so the flow is reachable without rewiring the global post-login redirect.

## Components / files

- `src/app/onboarding/bloom.css` — `.bloom` theme vars + base.
- `src/components/onboarding/icons.tsx` — line icons (Back/Check/Arrow/Mail/Flame/Dumbbell/Heart/Wind/Leaf/Bowl/Bell + Apple/Google brand marks).
- `src/components/onboarding/screens.tsx` — ScreenShell, Eyebrow, Title, PrimaryButton, GhostButton + the 8 screens (typed).
- `src/components/onboarding/OnboardingFlow.tsx` — controller (step/data/localStorage/auth/save).
- `src/app/onboarding/page.tsx` — mounts the flow (Hanken font, `.bloom` wrapper).
- `src/app/api/onboarding/route.ts` — `handleOnboarding` core + POST.
- `ProfileRepository.setOnboarding` + Supabase impl + fake.
- `src/app/login/page.tsx` — add the onboarding link.

## Non-goals

5-tab app, Apple/Google OAuth, real web push, BMI/calorie features, using goals/metrics in the coach (stored only). Desktop-specific layout beyond a centered column.

## Testing

- `handleOnboarding` core — Vitest: validation (rejects empty/oversized), maps fields, calls repo. Fake repo.
- Screen primitives are presentational (manual visual check).
- End-to-end (browser): walk all 8 steps, create an account, land on `/coach`, confirm the row has the data.
