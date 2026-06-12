# Sleep Context Tags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional multi-select context-factor chip row (카페인·음주·늦은 운동·스트레스·낮잠·야식) to sleep logging, stored as an allowlist-filtered `tags: string[]` in the sleep jsonb.

**Architecture:** `payload.ts` owns the allowlist (`SLEEP_TAGS`) and filters/dedupes tags deterministically in `buildSleepData` (unknown values dropped, key omitted when empty). `SleepLog.tsx` adds a third chip row that toggles a local Set and passes `tags` through the existing `onSubmit(SleepInput)` → `LogClient` → `POST /api/log` path, which needs no changes.

**Tech Stack:** Next.js 14 App Router (TS), Vitest. No schema change, no new dependencies.

---

## File Structure

| File | Change |
|---|---|
| `src/lib/log/payload.ts` | Export `SLEEP_TAGS` const; `SleepInput.tags?`; filter in `buildSleepData`. |
| `tests/log/payload.test.ts` | 3 new tag assertions. |
| `src/components/SleepLog.tsx` | Third chip row "수면에 영향 (선택)", multi-select Set, include `tags` in submit. |

### Task 1: Tags in the payload builder

**Files:**
- Modify: `src/lib/log/payload.ts`
- Test: `tests/log/payload.test.ts`

- [ ] **Step 1: Add the failing tests**

Append inside the existing `describe('payload builders', ...)` block in `tests/log/payload.test.ts` (import line already imports `buildSleepData`; extend it to also import `SLEEP_TAGS`):

```ts
  it('keeps only allowlisted sleep tags and dedupes', () => {
    expect(buildSleepData({ durationHours: 7, tags: ['카페인', '카페인', '음주', '외계인'] }))
      .toEqual({ duration_min: 420, tags: ['카페인', '음주'] });
  });

  it('omits the tags key when empty or all-unknown', () => {
    expect(buildSleepData({ durationHours: 7, tags: [] })).toEqual({ duration_min: 420 });
    expect(buildSleepData({ durationHours: 7, tags: ['외계인'] })).toEqual({ duration_min: 420 });
    expect(buildSleepData({ durationHours: 7 })).toEqual({ duration_min: 420 });
  });

  it('exposes the locked v1 allowlist', () => {
    expect(SLEEP_TAGS).toEqual(['카페인', '음주', '늦은 운동', '스트레스', '낮잠', '야식']);
  });
```

Update the import at the top of the test file to:

```ts
import {
  normalizeExercise, exerciseKey, buildWorkoutData, buildSleepData, SLEEP_TAGS,
} from '@/lib/log/payload';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/log/payload.test.ts`
Expected: FAIL — `SLEEP_TAGS` not exported.

- [ ] **Step 3: Implement in `src/lib/log/payload.ts`**

Add the exported const (above `buildSleepData`):

```ts
// Locked v1 context-factor chips (sleep). Allowlist enforced in code so the
// stored jsonb stays aggregatable — unknown values are dropped, never saved.
export const SLEEP_TAGS = ['카페인', '음주', '늦은 운동', '스트레스', '낮잠', '야식'] as const;
```

Extend `SleepInput`:

```ts
export interface SleepInput {
  durationHours?: number;
  quality?: '좋음' | '보통' | '나쁨';
  bed_time?: string;
  wake_time?: string;
  tags?: string[];
}
```

In `buildSleepData`, after the `satisfaction` block and BEFORE the final "no time info" guard, add:

```ts
  if (Array.isArray(i.tags)) {
    const allowed = (SLEEP_TAGS as readonly string[]);
    const tags = Array.from(new Set(i.tags.filter((t) => allowed.includes(t))));
    if (tags.length > 0) data.tags = tags;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/log/payload.test.ts`
Expected: PASS (8 tests). Then `npx vitest run` — all suites green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/log/payload.ts tests/log/payload.test.ts
git commit -m "feat: sleep context tags in payload builder (allowlist-filtered)"
```

### Task 2: Chip row in SleepLog

**Files:**
- Modify: `src/components/SleepLog.tsx`

- [ ] **Step 1: Add the tag chip row**

In `src/components/SleepLog.tsx`:

1. Extend the payload import:

```ts
import { SLEEP_TAGS, type SleepInput } from '@/lib/log/payload';
```

2. Add state next to `hours`/`quality`:

```ts
  const [tags, setTags] = useState<Set<string>>(new Set());
```

3. Add a toggle helper inside the component:

```ts
  function toggleTag(t: string) {
    setTags((cur) => {
      const next = new Set(cur);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  }
```

4. Insert a third chip row between the quality row and the submit button:

```tsx
      <p style={{ margin: '0 0 6px', fontSize: 13, color: '#666' }}>수면에 영향 (선택)</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        {SLEEP_TAGS.map((t) => (
          <button key={t} onClick={() => toggleTag(t)} type="button"
            style={chip(tags.has(t))}>{t}</button>
        ))}
      </div>
```

5. Include tags in the submit handler (only when selected):

```tsx
      <button type="button" disabled={busy}
        onClick={() => onSubmit({ durationHours: hours, quality, ...(tags.size > 0 ? { tags: Array.from(tags) } : {}) })}
        style={primaryBtn(busy)}>
        수면 기록
      </button>
```

- [ ] **Step 2: Gates**

Run: `npx tsc --noEmit && npx eslint . && npx vitest run`
Expected: all clean/green.

- [ ] **Step 3: Live verification (:3100)**

1. `/log` → 수면 섹션에 "수면에 영향 (선택)" 칩 줄 6개 렌더.
2. 카페인+스트레스 선택 → 수면 기록 → insight 발화.
3. Supabase: sleep row `data` = `{duration_min, satisfaction, tags:['카페인','스트레스']}`.
4. 태그 없이 저장 → `tags` 키 부재.
5. 저장 후 undo로 테스트 행 정리.

- [ ] **Step 4: Commit**

```bash
git add src/components/SleepLog.tsx
git commit -m "feat: sleep context tag chips (수면에 영향, multi-select)"
```

## Self-Review

- **Spec coverage:** allowlist+filter+dedupe+omit-empty (Task 1), chip row UI+optional submit (Task 2), no LogClient/route change needed (SleepInput flows through), live DB contract check (Task 2 Step 3). ✅
- **Placeholders:** none. **Type consistency:** `SLEEP_TAGS` readonly const used in both files; `tags?: string[]` on `SleepInput` consumed by SleepLog. ✅
