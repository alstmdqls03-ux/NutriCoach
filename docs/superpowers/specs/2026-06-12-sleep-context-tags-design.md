# Design: Sleep context tags (수면 컨텍스트 태깅)

Date: 2026-06-12
Status: APPROVED
Feature 1 of 3 from the benchmarking research (sleep tags → coach RAG → weekly recap).
Benchmark basis: InOut(인아웃) sticker-diary pattern — Korean users already consume sleep
logging as light sticker-style input; structured tags feed the upcoming coach-RAG analysis.

## Problem

Sleep logging today captures duration + satisfaction (좋음/보통/나쁨) but nothing about *why*
a night was good or bad. Without structured context, the future coach (Feature 2, RAG) has
no material to surface correlations like "카페인 마신 날 만족도가 낮아요". Free-text notes
would be unaggregatable and conflict with the accuracy-first principle.

## Decision

Add an optional **multi-select context-factor chip row** to the sleep logger.

### Data contract (no schema change)

sleep `data` jsonb gains one optional key:

```
{ bed_time?, wake_time?, duration_min?, satisfaction?, tags?: string[] }
```

- Additive — existing readers (query_logs, computeStreakInsight) unaffected.
- `tags` omitted entirely when empty (no `tags: []` noise).

### Fixed chip set (v1, locked)

`카페인 · 음주 · 늦은 운동 · 스트레스 · 낮잠 · 야식`

- Multi-select, fully optional (0..6).
- Allowlist enforced in code: unknown values are dropped at the builder, never stored.
- No free text in v1 (aggregation + accuracy). Custom chips deferred.

### UI

`SleepLog.tsx` gains a third chip row below the quality toggle, labeled
"수면에 영향 (선택)". Same chip styling as duration/quality; toggling adds/removes
from a local `Set`. Save works with nothing selected.

### Write path (deterministic, unchanged shape)

- `SleepInput` gains `tags?: string[]`.
- `buildSleepData` filters input against the allowlist (`SLEEP_TAGS` const exported from
  `payload.ts`), deduplicates, omits the key when the result is empty.
- `POST /api/log` unchanged — it already passes builder output through.

### Tests

Pure unit tests on `buildSleepData`:
1. Known tags pass through (and dedupe).
2. Unknown tags are dropped silently.
3. Empty/absent input → no `tags` key in output.
Plus live verification of the chip row + a DB contract spot-check.

## Out of scope (deferred)

- Custom user-defined chips.
- Workout context tagging.
- Any paid gating.
- Coach-side correlation analysis (that is Feature 2 — these tags are its input).

## Success criteria

- A sleep log with tags stores `tags` as a clean subset of the allowlist; without tags the
  key is absent.
- Existing sleep flows (duration-only, quality-only) keep working unchanged.
- All automated gates green (vitest, tsc, eslint) + live verification on /log.
