# Hybrid Retrieval — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace vector-only retrieval in `/api/coach/explain` with hybrid: vector + Postgres FTS, fused by Reciprocal Rank Fusion, diversified by MMR.

**Architecture:** New FTS RPC + tsvector column. Pure `fuse.ts` (cosine, RRF, MMR). `hybridRetrieve` orchestrator. `ExplainDeps.retrieve` grows the English query text. Downstream (explain→ground→cite) unchanged.

**Tech Stack:** Supabase Postgres FTS + pgvector, TS, Vitest.

---

## Plan Source

Implements `docs/superpowers/specs/2026-06-14-hybrid-retrieval-design.md`.

## File Structure

- `supabase/migrations/0006_rag_fts.sql` — tsvector column + GIN + `match_chunks_fts`.
- `src/lib/rag/fuse.ts` — `cosine`, `reciprocalRankFusion`, `mmr` (pure).
- `src/lib/rag/retrieve.ts` — add `retrieveChunksFts`, `fetchEmbeddings`, `hybridRetrieve` (modify).
- `src/lib/rag/explain.ts` — `ExplainDeps.retrieve(embedding, queryText, k)` (modify).
- `src/app/api/coach/explain/route.ts` — wire `hybridRetrieve` (modify).
- `evals/run-rag-eval.ts` — hybrid-vs-vector comparison (modify).
- `tests/rag/fuse.test.ts`, `tests/rag/explain.test.ts` (update).

---

## Task 1: Migration — FTS column + match_chunks_fts

**Files:** Create `supabase/migrations/0006_rag_fts.sql`

- [ ] **Step 1: Write**

```sql
-- Hybrid retrieval: full-text search over chunk content (English, post-translation).
alter table public.rag_chunks
  add column content_tsv tsvector generated always as (to_tsvector('english', content)) stored;
create index rag_chunks_tsv_idx on public.rag_chunks using gin (content_tsv);

create function public.match_chunks_fts(query text, match_count int)
returns table (chunk_id text, paper_id text, ordinal int, content text, similarity float)
language sql stable security invoker set search_path = public as $$
  select c.chunk_id, c.paper_id, c.ordinal, c.content,
         ts_rank_cd(c.content_tsv, websearch_to_tsquery('english', query)) as similarity
  from public.rag_chunks c
  where c.content_tsv @@ websearch_to_tsquery('english', query)
  order by similarity desc
  limit match_count;
$$;
revoke execute on function public.match_chunks_fts(text, int) from public, anon;
grant execute on function public.match_chunks_fts(text, int) to authenticated;
```

- [ ] **Step 2: Apply** via Supabase MCP `apply_migration` (name `0006_rag_fts`, project `npxvjnhzezzcplxdzonf`). The generated column backfills the 104 existing chunks. Verify: `select count(*) from rag_chunks where content_tsv is not null;` = 104. Run `get_advisors` (security) → no new lints.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0006_rag_fts.sql
git commit -m "feat(rag): migration for FTS column + match_chunks_fts"
```

---

## Task 2: fuse.ts — cosine, RRF, MMR

**Files:** Create `src/lib/rag/fuse.ts`, `tests/rag/fuse.test.ts`

- [ ] **Step 1: Failing test**

```typescript
// tests/rag/fuse.test.ts
import { describe, it, expect } from 'vitest';
import { cosine, reciprocalRankFusion, mmr } from '@/lib/rag/fuse';
import type { RetrievedChunk } from '@/lib/rag/types';

const c = (id: string): RetrievedChunk => ({ chunk_id: id, paper_id: 'P', ordinal: 0, content: id, similarity: 0 });

describe('cosine', () => {
  it('is 1 for identical vectors and 0 for orthogonal', () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
  });
});

describe('reciprocalRankFusion', () => {
  it('ranks a doc appearing high in both lists above singletons', () => {
    const a = [c('x'), c('y'), c('z')];
    const b = [c('y'), c('w')];
    const fused = reciprocalRankFusion([a, b]);
    expect(fused[0].chunk_id).toBe('y'); // appears in both, near top
    expect(new Set(fused.map((f) => f.chunk_id)).size).toBe(fused.length); // deduped
  });
});

describe('mmr', () => {
  it('picks a diverse second doc over a near-duplicate of the first', () => {
    const cand = [c('A'), c('Adup'), c('B')];
    const q = [1, 0];
    const emb = new Map<string, number[]>([
      ['A', [1, 0]], ['Adup', [0.99, 0.01]], ['B', [0.6, 0.8]],
    ]);
    const out = mmr(cand, q, emb, 0.5, 2);
    expect(out[0].chunk_id).toBe('A');          // most relevant
    expect(out[1].chunk_id).toBe('B');          // diverse, not the near-duplicate
  });
});
```

- [ ] **Step 2: Run → FAIL.** `npm test -- tests/rag/fuse.test.ts`

- [ ] **Step 3: Implement**

```typescript
// src/lib/rag/fuse.ts
import type { RetrievedChunk } from './types';

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

/** Reciprocal Rank Fusion: score(d) = Σ 1/(kRrf + rank). Deduped, sorted desc. */
export function reciprocalRankFusion(lists: RetrievedChunk[][], kRrf = 60): RetrievedChunk[] {
  const score = new Map<string, number>();
  const rep = new Map<string, RetrievedChunk>();
  for (const list of lists) {
    list.forEach((ch, i) => {
      score.set(ch.chunk_id, (score.get(ch.chunk_id) ?? 0) + 1 / (kRrf + i + 1));
      if (!rep.has(ch.chunk_id)) rep.set(ch.chunk_id, ch);
    });
  }
  return [...rep.values()].sort((a, b) => (score.get(b.chunk_id) ?? 0) - (score.get(a.chunk_id) ?? 0));
}

/** Maximal Marginal Relevance: balance relevance to query vs diversity from picked set. */
export function mmr(
  candidates: RetrievedChunk[], queryEmbedding: number[],
  embById: Map<string, number[]>, lambda: number, k: number,
): RetrievedChunk[] {
  const selected: RetrievedChunk[] = [];
  const pool = [...candidates];
  const rel = (ch: RetrievedChunk) => { const e = embById.get(ch.chunk_id); return e ? cosine(queryEmbedding, e) : 0; };
  while (selected.length < k && pool.length > 0) {
    let bestIdx = 0, bestScore = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const e = embById.get(pool[i].chunk_id);
      const div = selected.length === 0 ? 0 : Math.max(...selected.map((s) => {
        const se = embById.get(s.chunk_id);
        return e && se ? cosine(e, se) : 0;
      }));
      const score = lambda * rel(pool[i]) - (1 - lambda) * div;
      if (score > bestScore) { bestScore = score; bestIdx = i; }
    }
    selected.push(pool.splice(bestIdx, 1)[0]);
  }
  return selected;
}
```

- [ ] **Step 4: Run → PASS; commit**

```bash
git add src/lib/rag/fuse.ts tests/rag/fuse.test.ts
git commit -m "feat(rag): RRF + MMR fusion (pure)"
```

---

## Task 3: retrieve.ts — FTS, embeddings, hybridRetrieve

**Files:** Modify `src/lib/rag/retrieve.ts`

- [ ] **Step 1: Append**

```typescript
import { reciprocalRankFusion, mmr } from './fuse';

export async function retrieveChunksFts(
  sb: SupabaseClient, query: string, k: number,
): Promise<RetrievedChunk[]> {
  const { data, error } = await sb.rpc('match_chunks_fts', { query, match_count: k });
  if (error) throw new Error(`match_chunks_fts failed: ${error.message}`);
  return (data ?? []) as RetrievedChunk[];
}

export async function fetchEmbeddings(
  sb: SupabaseClient, ids: string[],
): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  if (ids.length === 0) return out;
  const { data, error } = await sb.from('rag_chunks').select('chunk_id,embedding').in('chunk_id', ids);
  if (error) throw new Error(`fetchEmbeddings failed: ${error.message}`);
  for (const r of data ?? []) {
    const raw = (r as { embedding: unknown }).embedding;
    const vec = typeof raw === 'string' ? JSON.parse(raw) : (raw as number[]);
    out.set((r as { chunk_id: string }).chunk_id, vec);
  }
  return out;
}

export interface HybridOpts { n?: number; m?: number; k?: number; kRrf?: number; lambda?: number; }

/** vector + FTS -> RRF -> MMR. */
export async function hybridRetrieve(
  sb: SupabaseClient, queryEmbedding: number[], queryText: string, opts: HybridOpts = {},
): Promise<RetrievedChunk[]> {
  const { n = 15, m = 12, k = 6, kRrf = 60, lambda = 0.7 } = opts;
  const [vec, fts] = await Promise.all([
    retrieveChunks(sb, queryEmbedding, n),
    retrieveChunksFts(sb, queryText, n),
  ]);
  const fused = reciprocalRankFusion([vec, fts], kRrf).slice(0, m);
  const embById = await fetchEmbeddings(sb, fused.map((c) => c.chunk_id));
  return mmr(fused, queryEmbedding, embById, lambda, k);
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit`

```bash
git add src/lib/rag/retrieve.ts
git commit -m "feat(rag): FTS retrieval + embedding fetch + hybridRetrieve orchestrator"
```

---

## Task 4: Thread query text through ExplainDeps

**Files:** Modify `src/lib/rag/explain.ts`, `tests/rag/explain.test.ts`

- [ ] **Step 1: Update the test's deps + add a query-text assertion**

In `tests/rag/explain.test.ts`, change the `retrieve` fake signature to `(embedding, queryText, k)` and assert it receives the translated text:

```typescript
  // inside deps():
    retrieve: async (_emb: number[], _q: string, _k: number) => chunks,
```

Add a test:

```typescript
  it('passes the translated English query to retrieve (for FTS)', async () => {
    let seen = '';
    const d = { ...deps('{}'), retrieve: async (_e: number[], q: string) => { seen = q; return chunks; } };
    await handleExplain({ body: { question: '가슴 볼륨' }, deps: d });
    expect(seen).toBe('weekly volume hypertrophy'); // deps.translate returns this
  });
```

- [ ] **Step 2: Run → FAIL** (signature mismatch). `npm test -- tests/rag/explain.test.ts`

- [ ] **Step 3: Update explain.ts**

Change the interface and the call:

```typescript
  retrieve: (embedding: number[], queryText: string, k: number) => Promise<RetrievedChunk[]>;
```

```typescript
  const en = await deps.translate(question);
  const embedding = await deps.embed(en);
  const chunks = await deps.retrieve(embedding, en, deps.k);
```

- [ ] **Step 4: Run → PASS; commit**

```bash
git add src/lib/rag/explain.ts tests/rag/explain.test.ts
git commit -m "feat(rag): thread English query text into retrieve (FTS needs it)"
```

---

## Task 5: Wire hybridRetrieve in the route

**Files:** Modify `src/app/api/coach/explain/route.ts`

- [ ] **Step 1: Swap the retrieve dep**

Change the import and the `retrieve` dep:

```typescript
import { hybridRetrieve } from '@/lib/rag/retrieve';
// ...
    retrieve: (emb, queryText, k) => hybridRetrieve(sb, emb, queryText, { k }),
```

(Remove the now-unused `retrieveChunks` import if present.)

- [ ] **Step 2: Typecheck + lint + commit**

Run: `npx tsc --noEmit && npm run lint`

```bash
git add src/app/api/coach/explain/route.ts
git commit -m "feat(rag): /api/coach/explain uses hybridRetrieve"
```

---

## Task 6: Eval — hybrid vs vector-only comparison

**Files:** Modify `evals/run-rag-eval.ts`

- [ ] **Step 1: Add a per-case comparison**

Update the eval so each case retrieves both ways and prints which surfaces the keyword. Replace the `deps.retrieve` and add comparison logging:

```typescript
import { hybridRetrieve, retrieveChunks } from '../src/lib/rag/retrieve';
// ...
    embed: async (t) => { lastEmbedding = (await embedTexts([t]))[0]; lastQuery = t; return lastEmbedding; },
    retrieve: async (emb, queryText, k) => { retrieved = await hybridRetrieve(sb, emb, queryText, { k }); return retrieved; },
// ...after handleExplain, before the assertion, compute the vector-only baseline:
    const vecOnly = await retrieveChunks(sb, lastEmbedding, 6);
    const hybridKw = retrieved.filter((r) => c.keyword.test(r.content)).length;
    const vecKw = vecOnly.filter((r) => c.keyword.test(r.content)).length;
    console.log(`  hybrid keyword-chunks=${hybridKw}  vector-only=${vecKw}`);
```

Declare `let lastEmbedding: number[] = []; let lastQuery = '';` near the top of the loop scope. Keep the existing PASS/FAIL assertion (no fabricated ids, keyword present).

- [ ] **Step 2: Commit**

```bash
git add evals/run-rag-eval.ts
git commit -m "feat(rag): eval compares hybrid vs vector-only keyword recall"
```

---

## Task 7: Full verification

- [ ] **Step 1:** `npm test` → all pass (existing + new fuse tests).
- [ ] **Step 2:** `npx tsc --noEmit && npm run lint` → clean.
- [ ] **Step 3:** `npm run eval:rag` → all cases PASS; hybrid keyword-chunks ≥ vector-only on the comparison lines.
- [ ] **Step 4:** `npm run dev`, sign in, generate a routine, click 왜 이 루틴? → cited claims still render (now from hybrid retrieval), no console errors.
- [ ] **Step 5:** `git status` clean (ignoring `.claude/`, `scripts/`, `evals/rag-papers/`).

---

## Self-Review (completed during planning)

**Spec coverage:** tsvector + FTS RPC → T1; cosine/RRF/MMR → T2; FTS retrieval + embedding fetch + orchestrator → T3; query-text threading → T4; route wiring → T5; hybrid-vs-vector eval → T6. ✓

**Placeholder scan:** none.

**Type consistency:** `RetrievedChunk` shared across vector + FTS (both RPCs return the same columns; `similarity` is cosine for vector, `ts_rank_cd` for FTS — only used by RRF via rank, not raw value, so the unit mismatch is harmless). `ExplainDeps.retrieve(embedding, queryText, k)` identical in `explain.ts`, route, eval. `hybridRetrieve` opts default to the spec's N=15/M=12/k=6/kRrf=60/λ=0.7.

**Risk:** MMR needs candidate embeddings not returned by the RPCs → `fetchEmbeddings` does one extra `select` on the fused set (~12 rows). pgvector returns the embedding as a string; `fetchEmbeddings` parses it. Covered by the live eval (T7 step 3).
