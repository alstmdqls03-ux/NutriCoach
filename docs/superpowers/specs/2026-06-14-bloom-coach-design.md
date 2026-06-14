# Design: Bloom coach (onboarding data + dark theme)

Date: 2026-06-14
Status: APPROVED (scope confirmed: coach screen + data wiring)
Builds on: Bloom onboarding (shipped) + the deterministic/RAG coach (shipped). The product ships as a **WebView-wrapped native app**, so web visual quality IS the product — the bare coach screen must match the Bloom onboarding it follows.

## Two parts

### A. Onboarding data → coach (function)
- `activity_level → experience` default (pure `experienceFromActivity`): `very→advanced`, `moderate→intermediate`, else (`start`/`light`/null)→`beginner`.
- `display_name` → greeting on `/coach` ("{name}님, 오늘도 가보죠 💪").
- `/coach` server page fetches `display_name, activity_level` (already fetches `gym_machines`) and passes `displayName` + `initialExperience` to `RoutineBuilder`.
- `RoutineBuilder` seeds its experience `<select>` from `initialExperience`; shows the greeting.

### B. Coach screen → Bloom theme (design)
Apply the Bloom token system to `/coach` so it matches onboarding:
- Shared `src/app/bloom-theme.css` — `.bloom-theme` class with the tokens (dark neutral + lime) + base text color, **without** the onboarding's fixed phone-frame. Hanken Grotesk via next/font on the page.
- Restyle `RoutineBuilder` + `AliasForm` + `ExplainPanel`: dark elevated cards (`--bg-elev`), lime primary buttons (`--accent`/`--accent-ink`), `--hair` borders, `--text`/`--text-2` text, `--r-card`/`--r-btn` radii. Replace the current hardcoded light inline colors with tokens.
- Restyle `TabBar`: dark blurred bottom bar, lime active tab (matches the design's tab bar).
- `Chat`: dark-compatible restyle (container + bubbles use tokens) so the page reads as one Bloom surface. The user bubble uses `--accent`; assistant uses `--bg-elev`.

## Scope / non-goals

- `/coach` page + its components (`RoutineBuilder`, `AliasForm`, `ExplainPanel`, `TabBar`, `Chat`).
- NOT in scope: `/login`, `/log`, `/reset` restyle (later); changing coach functionality; OAuth; using `goals`/metrics beyond storage (only `activity_level` + `display_name` are wired).

## Testing
- `experienceFromActivity` — pure unit tests (each mapping + null).
- The coach handler/engine is unchanged (already tested).
- End-to-end (browser): onboard with "Very active" → `/coach` shows experience=고급 default + greeting, all in Bloom dark/lime; generate a routine + "왜?" still works and looks themed.

## Files
- `src/lib/coach/experience.ts` (+ test) — activity→experience map.
- `src/app/bloom-theme.css` — shared `.bloom-theme` tokens.
- `src/app/coach/page.tsx` — fetch display_name/activity, wrap in `.bloom-theme` + Hanken, pass props.
- `src/components/coach/RoutineBuilder.tsx` — props + greeting + Bloom restyle.
- `src/components/TabBar.tsx`, `src/components/Chat.tsx` — Bloom restyle.
