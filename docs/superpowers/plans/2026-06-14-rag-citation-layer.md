# RAG Citation Layer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fill `CoachResponse.explanations` with NotebookLM-style cited claims: a "왜 이 루틴?" panel that answers a Korean question with claims grounded in real hypertrophy papers, each citing the exact chunk it came from — translation→embed→retrieve→explain→server-verified grounding.

**Architecture:** New `src/lib/rag/` module + `/api/coach/explain` route. pgvector stores chunk embeddings; `match_chunks` RPC does cosine top-k. The Korean query is translated to English before embedding (recall probe: +109% top-1). The LLM returns Korean claims + English evidence; grounding is verified server-side (English evidence vs English chunk) so citations are a code guarantee, not a prompt hope.

**Tech Stack:** Next.js 14 App Router (TS), Supabase Postgres + pgvector, OpenAI `text-embedding-3-small` + `gpt-4o-mini`, Vitest.

---

## Plan Source

Implements `docs/superpowers/specs/2026-06-14-rag-citation-layer-design.md`. Probe results already settled: query-translation is in v1; corpus = 4 OA PMC papers (already fetched into `evals/rag-papers/`, gitignored).

## File Structure

- `supabase/migrations/0004_rag.sql` — pgvector, `rag_papers`, `rag_chunks`, `match_chunks`, RLS.
- `src/lib/rag/types.ts` — `Chunk`, `RetrievedChunk`, `RawExplanation`, `Citation`, `ExplainResult`.
- `src/lib/rag/chunk.ts` — `chunkPaper` (stable ids + content hash).
- `src/lib/rag/grounding.ts` — `tokenContainment`, `verifyExplanations` (the integrity guarantee).
- `src/lib/rag/explainPrompt.ts` — `buildExplainMessages`, `parseExplainJson`.
- `src/lib/rag/translate.ts` — `translateToEnglish`.
- `src/lib/rag/embed.ts` — `embedTexts` (OpenAI wrapper).
- `src/lib/rag/retrieve.ts` — `retrieveChunks` (rpc wrapper).
- `src/lib/rag/explain.ts` — `handleExplain` (DI core, unit-testable).
- `src/app/api/coach/explain/route.ts` — thin wrapper wiring real deps.
- `src/components/coach/RoutineBuilder.tsx` — "왜 이 루틴?" panel (modify).
- `evals/fetch-papers.ts` — reproducible corpus fetch (PMCIDs → BioC).
- `evals/ingest-rag.ts` — chunk+embed+print INSERT SQL for ingestion.
- `evals/run-rag-eval.ts` — eval harness.
- Tests under `tests/rag/`.

---

## Task 1: Migration — pgvector + rag tables + match_chunks

**Files:**
- Create: `supabase/migrations/0004_rag.sql`

- [ ] **Step 1: Write the migration**

```sql
-- RAG citation layer: pgvector store + cosine retrieval function.
create extension if not exists vector;

create table public.rag_papers (
  paper_id       text primary key,
  title          text not null,
  citation_label text not null,   -- e.g. 'Baz et al. 2022'
  source_url     text,
  license        text
);

create table public.rag_chunks (
  chunk_id     text primary key,           -- {paper_id}#{ordinal}-{hash8}
  paper_id     text not null references public.rag_papers(paper_id) on delete cascade,
  ordinal      int not null,
  content      text not null,
  content_hash text not null,
  embedding    vector(1536) not null,
  created_at   timestamptz not null default now()
);
create index rag_chunks_embedding_idx on public.rag_chunks
  using hnsw (embedding vector_cosine_ops);

alter table public.rag_papers enable row level security;
alter table public.rag_chunks enable row level security;
-- Shared read-only reference data: any authenticated user may read.
create policy "read papers" on public.rag_papers
  for select to authenticated using (true);
create policy "read chunks" on public.rag_chunks
  for select to authenticated using (true);
-- No insert/update/delete policy: ingestion runs with elevated access only.

-- Cosine top-k. SECURITY DEFINER so it runs regardless of per-row policies,
-- but it only ever returns reference data. search_path pinned.
create function public.match_chunks(query_embedding vector(1536), match_count int)
returns table (chunk_id text, paper_id text, ordinal int, content text, similarity float)
language sql stable security definer set search_path = public as $$
  select c.chunk_id, c.paper_id, c.ordinal, c.content,
         1 - (c.embedding <=> query_embedding) as similarity
  from public.rag_chunks c
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
revoke execute on function public.match_chunks(vector, int) from anon;
grant execute on function public.match_chunks(vector, int) to authenticated;
```

- [ ] **Step 2: Apply via Supabase MCP**

Apply with the Supabase MCP `apply_migration` tool (name `0004_rag`, project `npxvjnhzezzcplxdzonf`). Then `list_extensions` → confirm `vector` enabled; `list_tables` → confirm `rag_papers`, `rag_chunks`. Run `get_advisors` (security) → no new RLS lints.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0004_rag.sql
git commit -m "feat(rag): migration for pgvector + rag tables + match_chunks"
```

---

## Task 2: Shared RAG types

**Files:**
- Create: `src/lib/rag/types.ts`

- [ ] **Step 1: Write the types**

```typescript
// src/lib/rag/types.ts
export interface Chunk {
  chunk_id: string;
  paper_id: string;
  ordinal: number;
  content: string;
  content_hash: string;
}

export interface RetrievedChunk {
  chunk_id: string;
  paper_id: string;
  ordinal: number;
  content: string;
  similarity: number;
}

/** What the LLM emits per explanation. evidence_en is English, used only for grounding. */
export interface RawExplanation {
  claim_ko: string;
  evidence_en: string;
  chunk_ids: string[];
}

export interface Citation {
  chunk_id: string;
  label: string;   // citation_label + '#' + ordinal
  snippet: string; // short chunk excerpt
}

import type { Explanation } from '@/lib/coach/types';
export interface ExplainResult {
  explanations: Explanation[];  // { claim, chunk_ids } — claim is Korean, shown to user
  citations: Citation[];
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit` (expect clean).

```bash
git add src/lib/rag/types.ts
git commit -m "feat(rag): shared types"
```

---

## Task 3: Chunker

**Files:**
- Create: `src/lib/rag/chunk.ts`
- Test: `tests/rag/chunk.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/rag/chunk.test.ts
import { describe, it, expect } from 'vitest';
import { chunkPaper } from '@/lib/rag/chunk';

describe('chunkPaper', () => {
  const text = 'Para one about volume.\n\nPara two about frequency.\n\n' + 'x'.repeat(1600) + '\n\nPara four.';

  it('produces stable, unique chunk ids prefixed by paper id', () => {
    const chunks = chunkPaper('PMC1', text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.chunk_id.startsWith('PMC1#')).toBe(true);
    expect(new Set(chunks.map((c) => c.chunk_id)).size).toBe(chunks.length);
  });

  it('is deterministic — same input reproduces same ids + hashes', () => {
    expect(chunkPaper('PMC1', text)).toEqual(chunkPaper('PMC1', text));
  });

  it('changes the hash (and id) when content changes', () => {
    const a = chunkPaper('PMC1', 'hello world')[0];
    const b = chunkPaper('PMC1', 'hello there')[0];
    expect(a.content_hash).not.toBe(b.content_hash);
    expect(a.chunk_id).not.toBe(b.chunk_id);
  });

  it('packs short paragraphs together but splits past the size target', () => {
    const chunks = chunkPaper('PMC1', text);
    // the 1600-char paragraph forces its own chunk; total chars conserved-ish
    expect(chunks.some((c) => c.content.length > 1000)).toBe(true);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test -- tests/rag/chunk.test.ts` → module not found.

- [ ] **Step 3: Implement**

```typescript
// src/lib/rag/chunk.ts
import { createHash } from 'node:crypto';
import type { Chunk } from './types';

const TARGET_CHARS = 1500;

function hash8(s: string): string {
  return createHash('sha256').update(s).digest('hex').slice(0, 8);
}

/** Greedy paragraph packing into ~TARGET_CHARS chunks with deterministic ids. */
export function chunkPaper(paperId: string, text: string): Chunk[] {
  const paras = text.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const out: Chunk[] = [];
  let buf = '';
  let ordinal = 0;
  const flush = () => {
    if (!buf) return;
    const content_hash = hash8(buf);
    out.push({
      chunk_id: `${paperId}#${ordinal}-${content_hash}`,
      paper_id: paperId, ordinal, content: buf, content_hash,
    });
    ordinal++;
    buf = '';
  };
  for (const p of paras) {
    if (buf && buf.length + p.length > TARGET_CHARS) flush();
    buf = buf ? `${buf} ${p}` : p;
  }
  flush();
  return out;
}
```

- [ ] **Step 4: Run — expect PASS; commit**

Run: `npm test -- tests/rag/chunk.test.ts`

```bash
git add src/lib/rag/chunk.ts tests/rag/chunk.test.ts
git commit -m "feat(rag): deterministic paper chunker"
```

---

## Task 4: Grounding verification (the integrity guarantee)

**Files:**
- Create: `src/lib/rag/grounding.ts`
- Test: `tests/rag/grounding.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/rag/grounding.test.ts
import { describe, it, expect } from 'vitest';
import { tokenContainment, verifyExplanations } from '@/lib/rag/grounding';
import type { RawExplanation } from '@/lib/rag/types';

describe('tokenContainment', () => {
  it('is 1 when all evidence tokens appear in the chunk', () => {
    expect(tokenContainment('weekly volume sets', 'training weekly volume in sets drives hypertrophy')).toBe(1);
  });
  it('is 0 when none appear', () => {
    expect(tokenContainment('banana spaceship', 'training volume and sets')).toBe(0);
  });
  it('ignores stopwords', () => {
    expect(tokenContainment('the of and', 'training volume')).toBe(0); // all stopwords -> no content tokens -> 0
  });
});

describe('verifyExplanations', () => {
  const retrieved = new Set(['PMC1#0-aa', 'PMC1#1-bb']);
  const textById = new Map([
    ['PMC1#0-aa', 'weekly training volume of ten to twenty sets per muscle drives hypertrophy'],
    ['PMC1#1-bb', 'proximity to failure influences the hypertrophic stimulus'],
  ]);

  it('drops chunk_ids that were not retrieved (anti-hallucination)', () => {
    const raw: RawExplanation[] = [
      { claim_ko: '주당 10-20세트', evidence_en: 'weekly volume sets per muscle hypertrophy', chunk_ids: ['PMC1#0-aa', 'FAKE#9-zz'] },
    ];
    const out = verifyExplanations(raw, retrieved, textById, 0.5);
    expect(out).toHaveLength(1);
    expect(out[0].chunk_ids).toEqual(['PMC1#0-aa']);
  });

  it('drops a claim whose evidence is not grounded in its cited chunk', () => {
    const raw: RawExplanation[] = [
      { claim_ko: '근거 없음', evidence_en: 'cardio running marathon banana', chunk_ids: ['PMC1#0-aa'] },
    ];
    expect(verifyExplanations(raw, retrieved, textById, 0.5)).toEqual([]);
  });

  it('maps a surviving claim to the public Explanation shape (claim = Korean)', () => {
    const raw: RawExplanation[] = [
      { claim_ko: '실패 근접이 자극에 영향', evidence_en: 'proximity to failure hypertrophic stimulus', chunk_ids: ['PMC1#1-bb'] },
    ];
    const out = verifyExplanations(raw, retrieved, textById, 0.5);
    expect(out).toEqual([{ claim: '실패 근접이 자극에 영향', chunk_ids: ['PMC1#1-bb'] }]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test -- tests/rag/grounding.test.ts`

- [ ] **Step 3: Implement**

```typescript
// src/lib/rag/grounding.ts
import type { Explanation } from '@/lib/coach/types';
import type { RawExplanation } from './types';

const STOPWORDS = new Set([
  'the', 'a', 'an', 'of', 'and', 'or', 'to', 'in', 'on', 'for', 'is', 'are', 'be',
  'with', 'that', 'this', 'it', 'as', 'by', 'at', 'from', 'per', 'can', 'may',
]);

function contentTokens(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/** Fraction of evidence content-tokens present in the chunk text. 0 when no content tokens. */
export function tokenContainment(evidence: string, chunk: string): number {
  const ev = contentTokens(evidence);
  if (ev.length === 0) return 0;
  const inChunk = new Set(contentTokens(chunk));
  const hits = ev.filter((t) => inChunk.has(t)).length;
  return hits / ev.length;
}

/**
 * Turn model-emitted RawExplanations into verified public Explanations.
 * 1) keep only chunk_ids that were actually retrieved (anti-hallucination),
 * 2) require evidence grounded in the cited chunk text (containment >= threshold),
 * 3) drop claims with no surviving chunk_ids.
 */
export function verifyExplanations(
  raw: RawExplanation[],
  retrievedIds: Set<string>,
  chunkTextById: Map<string, string>,
  threshold: number,
): Explanation[] {
  const out: Explanation[] = [];
  for (const r of raw) {
    const grounded = (r.chunk_ids ?? [])
      .filter((id) => retrievedIds.has(id))
      .filter((id) => tokenContainment(r.evidence_en, chunkTextById.get(id) ?? '') >= threshold);
    if (grounded.length > 0) out.push({ claim: r.claim_ko, chunk_ids: grounded });
  }
  return out;
}
```

- [ ] **Step 4: Run — expect PASS; commit**

```bash
git add src/lib/rag/grounding.ts tests/rag/grounding.test.ts
git commit -m "feat(rag): grounding verification (anti-hallucination + evidence containment)"
```

---

## Task 5: Explain prompt builder + JSON parser

**Files:**
- Create: `src/lib/rag/explainPrompt.ts`
- Test: `tests/rag/explainPrompt.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/rag/explainPrompt.test.ts
import { describe, it, expect } from 'vitest';
import { buildExplainMessages, parseExplainJson } from '@/lib/rag/explainPrompt';
import type { RetrievedChunk } from '@/lib/rag/types';

const chunks: RetrievedChunk[] = [
  { chunk_id: 'PMC1#0-aa', paper_id: 'PMC1', ordinal: 0, content: 'weekly volume drives hypertrophy', similarity: 0.6 },
];

describe('buildExplainMessages', () => {
  it('includes the question and every chunk id+text', () => {
    const msgs = buildExplainMessages('가슴 볼륨?', chunks);
    const joined = msgs.map((m) => m.content).join('\n');
    expect(joined).toContain('가슴 볼륨?');
    expect(joined).toContain('PMC1#0-aa');
    expect(joined).toContain('weekly volume drives hypertrophy');
  });
});

describe('parseExplainJson', () => {
  it('parses a clean JSON object', () => {
    const out = parseExplainJson('{"explanations":[{"claim_ko":"가","evidence_en":"weekly volume","chunk_ids":["PMC1#0-aa"]}]}');
    expect(out).toEqual([{ claim_ko: '가', evidence_en: 'weekly volume', chunk_ids: ['PMC1#0-aa'] }]);
  });
  it('tolerates ```json fences', () => {
    const out = parseExplainJson('```json\n{"explanations":[{"claim_ko":"가","evidence_en":"x","chunk_ids":[]}]}\n```');
    expect(out).toHaveLength(1);
  });
  it('returns [] on garbage', () => {
    expect(parseExplainJson('not json')).toEqual([]);
  });
  it('skips malformed entries', () => {
    const out = parseExplainJson('{"explanations":[{"claim_ko":123},{"claim_ko":"ok","evidence_en":"e","chunk_ids":["a"]}]}');
    expect(out).toEqual([{ claim_ko: 'ok', evidence_en: 'e', chunk_ids: ['a'] }]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test -- tests/rag/explainPrompt.test.ts`

- [ ] **Step 3: Implement**

```typescript
// src/lib/rag/explainPrompt.ts
import type { ChatMessage } from '@/lib/llm/types';
import type { RawExplanation, RetrievedChunk } from './types';

const SYSTEM = [
  '너는 근비대 코치의 설명 엔진이다. 사용자의 질문과 근거 청크(영문 논문 발췌)가 주어진다.',
  '각 설명은 반드시 제공된 청크에서 뒷받침되어야 한다. 청크로 뒷받침할 수 없으면 그 주장은 생략한다.',
  '출력은 JSON만: {"explanations":[{"claim_ko": "한국어 주장", "evidence_en": "근거가 된 영어 문장/구(청크에서)", "chunk_ids": ["<청크 id>"]}]}',
  'chunk_ids 는 제공된 id 중에서만 고른다. 숫자(무게/세트/반복)는 만들지 말 것 — 일반 원리만 설명한다.',
].join('\n');

export function buildExplainMessages(question: string, chunks: RetrievedChunk[]): ChatMessage[] {
  const corpus = chunks.map((c) => `[${c.chunk_id}] ${c.content}`).join('\n\n');
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `질문: ${question}\n\n근거 청크:\n${corpus}` },
  ];
}

function asRaw(x: unknown): RawExplanation | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  if (typeof o.claim_ko !== 'string' || typeof o.evidence_en !== 'string') return null;
  const ids = Array.isArray(o.chunk_ids) ? o.chunk_ids.filter((i): i is string => typeof i === 'string') : [];
  return { claim_ko: o.claim_ko, evidence_en: o.evidence_en, chunk_ids: ids };
}

/** Tolerant parse: strips ``` fences, reads .explanations, coerces entries, skips malformed. */
export function parseExplainJson(content: string | null): RawExplanation[] {
  if (!content) return [];
  const stripped = content.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  let parsed: unknown;
  try { parsed = JSON.parse(stripped); } catch { return []; }
  const arr = (parsed as { explanations?: unknown })?.explanations;
  if (!Array.isArray(arr)) return [];
  return arr.map(asRaw).filter((r): r is RawExplanation => r !== null);
}
```

- [ ] **Step 4: Run — expect PASS; commit**

```bash
git add src/lib/rag/explainPrompt.ts tests/rag/explainPrompt.test.ts
git commit -m "feat(rag): explain prompt builder + tolerant JSON parser"
```

---

## Task 6: Query translation

**Files:**
- Create: `src/lib/rag/translate.ts`
- Test: `tests/rag/translate.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/rag/translate.test.ts
import { describe, it, expect } from 'vitest';
import { translateToEnglish } from '@/lib/rag/translate';
import type { LLMProvider, LLMResponse } from '@/lib/llm/types';

function scripted(content: string): LLMProvider {
  return { chat: async (): Promise<LLMResponse> => ({ content, toolCalls: [], usage: { promptTokens: 1, completionTokens: 1 } }) };
}

describe('translateToEnglish', () => {
  it('returns the trimmed English query from the model', async () => {
    const out = await translateToEnglish(scripted('  weekly chest training volume  '), '가슴 볼륨 얼마나');
    expect(out).toBe('weekly chest training volume');
  });
  it('falls back to the original text when the model returns empty', async () => {
    const out = await translateToEnglish(scripted(''), '가슴 볼륨');
    expect(out).toBe('가슴 볼륨');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test -- tests/rag/translate.test.ts`

- [ ] **Step 3: Implement**

```typescript
// src/lib/rag/translate.ts
import type { LLMProvider } from '@/lib/llm/types';

/** Translate a Korean fitness question to a concise English search query. */
export async function translateToEnglish(llm: LLMProvider, korean: string): Promise<string> {
  const res = await llm.chat([
    { role: 'system', content: 'Translate the user\'s Korean fitness question into a concise English search query. Output ONLY the English query, no quotes or extra words.' },
    { role: 'user', content: korean },
  ], []);
  const out = (res.content ?? '').trim();
  return out || korean;
}
```

- [ ] **Step 4: Run — expect PASS; commit**

```bash
git add src/lib/rag/translate.ts tests/rag/translate.test.ts
git commit -m "feat(rag): Korean->English query translation"
```

---

## Task 7: Embedding + retrieval wrappers

**Files:**
- Create: `src/lib/rag/embed.ts`, `src/lib/rag/retrieve.ts`

Thin I/O wrappers (covered indirectly by the route test via fakes; no standalone unit test).

- [ ] **Step 1: Write embed.ts**

```typescript
// src/lib/rag/embed.ts
import OpenAI from 'openai';

const MODEL = 'text-embedding-3-small';

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 100) {
    const res = await client.embeddings.create({ model: MODEL, input: texts.slice(i, i + 100) });
    for (const d of res.data) out.push(d.embedding as number[]);
  }
  return out;
}
```

- [ ] **Step 2: Write retrieve.ts**

```typescript
// src/lib/rag/retrieve.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RetrievedChunk } from './types';

export async function retrieveChunks(
  sb: SupabaseClient, embedding: number[], k: number,
): Promise<RetrievedChunk[]> {
  const { data, error } = await sb.rpc('match_chunks', { query_embedding: embedding, match_count: k });
  if (error) throw new Error(`match_chunks failed: ${error.message}`);
  return (data ?? []) as RetrievedChunk[];
}
```

- [ ] **Step 3: Typecheck + commit**

Run: `npx tsc --noEmit`

```bash
git add src/lib/rag/embed.ts src/lib/rag/retrieve.ts
git commit -m "feat(rag): embedding + retrieval wrappers"
```

---

## Task 8: handleExplain (DI core)

**Files:**
- Create: `src/lib/rag/explain.ts`
- Test: `tests/rag/explain.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/rag/explain.test.ts
import { describe, it, expect } from 'vitest';
import { handleExplain, type ExplainDeps } from '@/lib/rag/explain';
import type { RetrievedChunk } from '@/lib/rag/types';

const chunks: RetrievedChunk[] = [
  { chunk_id: 'PMC1#0-aa', paper_id: 'PMC1', ordinal: 0, content: 'weekly training volume of ten to twenty sets drives hypertrophy', similarity: 0.6 },
];

function deps(llmJson: string): ExplainDeps {
  return {
    translate: async () => 'weekly volume hypertrophy',
    embed: async () => [0.1, 0.2],
    retrieve: async () => chunks,
    explain: async () => llmJson,
    labelFor: () => 'Test 2022',
    threshold: 0.5,
    k: 6,
  };
}

describe('handleExplain', () => {
  it('400s on empty question', async () => {
    const r = await handleExplain({ body: { question: '  ' }, deps: deps('{}') });
    expect(r.status).toBe(400);
  });

  it('returns grounded explanations + citations', async () => {
    const json = '{"explanations":[{"claim_ko":"주당 10-20세트가 근비대를 이끈다","evidence_en":"weekly volume ten twenty sets hypertrophy","chunk_ids":["PMC1#0-aa"]}]}';
    const r = await handleExplain({ body: { question: '가슴 볼륨 얼마나' }, deps: deps(json) });
    expect(r.status).toBe(200);
    if ('explanations' in r.body) {
      expect(r.body.explanations).toEqual([{ claim: '주당 10-20세트가 근비대를 이끈다', chunk_ids: ['PMC1#0-aa'] }]);
      expect(r.body.citations[0]).toMatchObject({ chunk_id: 'PMC1#0-aa', label: 'Test 2022#0' });
    }
  });

  it('drops a fabricated chunk_id (server-verified)', async () => {
    const json = '{"explanations":[{"claim_ko":"환각","evidence_en":"weekly volume hypertrophy","chunk_ids":["FAKE#9-zz"]}]}';
    const r = await handleExplain({ body: { question: '가슴 볼륨' }, deps: deps(json) });
    if ('explanations' in r.body) expect(r.body.explanations).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npm test -- tests/rag/explain.test.ts`

- [ ] **Step 3: Implement**

```typescript
// src/lib/rag/explain.ts
import type { RetrievedChunk, Citation, ExplainResult } from './types';
import { verifyExplanations } from './grounding';
import { parseExplainJson } from './explainPrompt';

export interface ExplainDeps {
  translate: (korean: string) => Promise<string>;
  embed: (text: string) => Promise<number[]>;
  retrieve: (embedding: number[], k: number) => Promise<RetrievedChunk[]>;
  explain: (question: string, chunks: RetrievedChunk[]) => Promise<string | null>;
  labelFor: (paperId: string) => string;  // paper_id -> citation label
  threshold: number;
  k: number;
}

export interface ExplainArgs { body: unknown; deps: ExplainDeps; }
export interface ExplainHandlerResult { status: number; body: ExplainResult | { error: string }; }

export async function handleExplain({ body, deps }: ExplainArgs): Promise<ExplainHandlerResult> {
  const question = typeof (body as Record<string, unknown>)?.question === 'string'
    ? ((body as Record<string, unknown>).question as string).trim() : '';
  if (!question) return { status: 400, body: { error: '질문을 입력해주세요.' } };

  const en = await deps.translate(question);
  const embedding = await deps.embed(en);
  const chunks = await deps.retrieve(embedding, deps.k);

  const retrievedIds = new Set(chunks.map((c) => c.chunk_id));
  const textById = new Map(chunks.map((c) => [c.chunk_id, c.content]));

  const llmJson = await deps.explain(question, chunks);
  const raw = parseExplainJson(llmJson);
  const explanations = verifyExplanations(raw, retrievedIds, textById, deps.threshold);

  const usedIds = new Set(explanations.flatMap((e) => e.chunk_ids));
  const citations: Citation[] = chunks
    .filter((c) => usedIds.has(c.chunk_id))
    .map((c) => ({
      chunk_id: c.chunk_id,
      label: `${deps.labelFor(c.paper_id)}#${c.ordinal}`,
      snippet: c.content.slice(0, 160),
    }));

  return { status: 200, body: { explanations, citations } };
}
```

- [ ] **Step 4: Run — expect PASS; commit**

```bash
git add src/lib/rag/explain.ts tests/rag/explain.test.ts
git commit -m "feat(rag): handleExplain DI core with server-verified grounding"
```

---

## Task 9: /api/coach/explain route

**Files:**
- Create: `src/app/api/coach/explain/route.ts`

Wires real deps. No standalone test (core is tested in Task 8).

- [ ] **Step 1: Implement**

```typescript
// src/app/api/coach/explain/route.ts
import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { getLLM } from '@/lib/llm';
import { handleExplain, type ExplainDeps } from '@/lib/rag/explain';
import { translateToEnglish } from '@/lib/rag/translate';
import { embedTexts } from '@/lib/rag/embed';
import { retrieveChunks } from '@/lib/rag/retrieve';
import { buildExplainMessages } from '@/lib/rag/explainPrompt';

const GROUNDING_THRESHOLD = 0.5; // provisional; tune via eval
const TOP_K = 6;

export async function POST(req: Request) {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  if (!data.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const llm = getLLM();

  // Paper labels for citations (small table; fetch once per request).
  const { data: papers } = await sb.from('rag_papers').select('paper_id,citation_label');
  const labels = new Map((papers ?? []).map((p) => [p.paper_id as string, p.citation_label as string]));

  const deps: ExplainDeps = {
    translate: (ko) => translateToEnglish(llm, ko),
    embed: async (t) => (await embedTexts([t]))[0],
    retrieve: (emb, k) => retrieveChunks(sb, emb, k),
    explain: async (q, chunks) => (await llm.chat(buildExplainMessages(q, chunks), [])).content,
    labelFor: (id) => labels.get(id) ?? id,
    threshold: GROUNDING_THRESHOLD,
    k: TOP_K,
  };

  try {
    const res = await handleExplain({ body, deps });
    return NextResponse.json(res.body, { status: res.status });
  } catch (e) {
    console.error('explain error', e);
    return NextResponse.json({ error: '설명을 생성하지 못했어요.' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit`

```bash
git add src/app/api/coach/explain/route.ts
git commit -m "feat(rag): POST /api/coach/explain route"
```

---

## Task 10: Reproducible fetch + ingestion scripts

**Files:**
- Create: `evals/fetch-papers.ts`, `evals/ingest-rag.ts`
- Modify: `package.json` (scripts)

- [ ] **Step 1: fetch-papers.ts** (PMCIDs → BioC text → evals/rag-papers/*.txt)

```typescript
// evals/fetch-papers.ts
import { writeFileSync } from 'node:fs';

const PAPERS: Record<string, { url: string; label: string }> = {
  PMC8884877: { url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8884877/', label: 'Baz-Valle et al. 2022' },
  PMC13215239: { url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC13215239/', label: 'Level of Effort 2025' },
  PMC13236796: { url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC13236796/', label: 'What is Resistance Exercise 2025' },
  PMC13215244: { url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC13215244/', label: 'Variable vs Free Weight 2025' },
};

interface Passage { text?: string; infons?: Record<string, string>; }
function extract(bioc: unknown): string {
  const arr = bioc as Array<{ documents?: Array<{ passages?: Passage[] }> }>;
  const docs = Array.isArray(arr) ? (arr[0]?.documents ?? []) : [];
  const paras: string[] = [];
  for (const doc of docs) for (const p of doc.passages ?? []) {
    const sec = (p.infons?.section_type || p.infons?.type || '').toUpperCase();
    if (sec.includes('REF') || sec === 'TABLE' || sec === 'FIG') continue;
    const t = (p.text ?? '').trim();
    if (t) paras.push(t);
  }
  return paras.join('\n\n');
}

async function main() {
  const dir = new URL('./rag-papers/', import.meta.url);
  for (const id of Object.keys(PAPERS)) {
    const res = await fetch(`https://www.ncbi.nlm.nih.gov/research/bionlp/RESTful/pmcoa.cgi/BioC_json/${id}/unicode`);
    if (!res.ok) { console.log(`${id}: FETCH ${res.status}`); continue; }
    const text = extract(await res.json());
    if (text.length < 2000) { console.log(`${id}: too short`); continue; }
    writeFileSync(new URL(`${id}.txt`, dir), text, 'utf8');
    console.log(`${id}: saved ${text.length} chars`);
  }
}
main();
```

- [ ] **Step 2: ingest-rag.ts** (chunk + embed + print INSERT SQL)

This computes everything locally and prints SQL to stdout. Apply the SQL via the Supabase MCP `execute_sql` (the anon key in `.env.local` cannot write to `rag_*`).

```typescript
// evals/ingest-rag.ts
import { readFileSync, readdirSync } from 'node:fs';
import { loadEnvLocal } from './_loadEnv';
import { chunkPaper } from '../src/lib/rag/chunk';
import { embedTexts } from '../src/lib/rag/embed';

loadEnvLocal();

const LABELS: Record<string, { title: string; label: string }> = {
  PMC8884877: { title: 'Resistance Training Volume and Muscle Hypertrophy', label: 'Baz-Valle et al. 2022' },
  PMC13215239: { title: 'Level of Effort: RT Monitoring and Prescription', label: 'Level of Effort 2025' },
  PMC13236796: { title: 'What is Resistance Exercise?', label: 'What is Resistance Exercise 2025' },
  PMC13215244: { title: 'Variable Resistance vs Free Weight Activation', label: 'Variable vs Free Weight 2025' },
};

function sqlStr(s: string): string { return `'${s.replace(/'/g, "''")}'`; }

async function main() {
  const dir = new URL('./rag-papers/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.txt') && !/^readme/i.test(f));
  const paperRows: string[] = [];
  const chunkRows: string[] = [];

  for (const f of files) {
    const paperId = f.replace(/\.txt$/, '');
    const meta = LABELS[paperId] ?? { title: paperId, label: paperId };
    paperRows.push(`(${sqlStr(paperId)}, ${sqlStr(meta.title)}, ${sqlStr(meta.label)}, ${sqlStr('https://www.ncbi.nlm.nih.gov/pmc/articles/' + paperId + '/')}, ${sqlStr('PMC OA')})`);

    const chunks = chunkPaper(paperId, readFileSync(new URL(f, dir), 'utf8'));
    const vecs = await embedTexts(chunks.map((c) => c.content));
    chunks.forEach((c, i) => {
      const vec = `'[${vecs[i].join(',')}]'`;
      chunkRows.push(`(${sqlStr(c.chunk_id)}, ${sqlStr(c.paper_id)}, ${c.ordinal}, ${sqlStr(c.content)}, ${sqlStr(c.content_hash)}, ${vec})`);
    });
    console.error(`${paperId}: ${chunks.length} chunks embedded`);
  }

  console.log('insert into rag_papers (paper_id,title,citation_label,source_url,license) values');
  console.log(paperRows.join(',\n') + '\non conflict (paper_id) do nothing;');
  console.log('\ninsert into rag_chunks (chunk_id,paper_id,ordinal,content,content_hash,embedding) values');
  console.log(chunkRows.join(',\n') + '\non conflict (chunk_id) do nothing;');
}
main();
```

- [ ] **Step 3: Add scripts**

In `package.json` scripts, after `probe:recall`:

```json
    "rag:fetch": "tsx evals/fetch-papers.ts",
    "rag:ingest": "tsx evals/ingest-rag.ts > /tmp/rag-ingest.sql",
```

- [ ] **Step 4: Run ingestion + apply**

```bash
npm run rag:ingest   # writes /tmp/rag-ingest.sql (embeddings computed via OpenAI)
```
Then apply `/tmp/rag-ingest.sql` to the project with the Supabase MCP `execute_sql` (split into the `rag_papers` insert then the `rag_chunks` insert if the payload is large). Verify: `select count(*) from rag_chunks;` returns the expected chunk count (~100).

- [ ] **Step 5: Commit (scripts only; papers + SQL stay out of git)**

```bash
git add evals/fetch-papers.ts evals/ingest-rag.ts package.json
git commit -m "feat(rag): reproducible fetch + ingestion scripts"
```

---

## Task 11: UI — "왜 이 루틴?" cited panel

**Files:**
- Modify: `src/components/coach/RoutineBuilder.tsx`

UI verified manually; the logic is covered by Tasks 3–8.

- [ ] **Step 1: Add an Explain panel to RoutineBuilder**

After the routine `<ul>`, add a button + panel. Add this component to the file and render `<ExplainPanel targetMuscle={res.routine.targetMuscle} />` right after the exercises list:

```tsx
function ExplainPanel({ targetMuscle }: { targetMuscle: string }) {
  const [data, setData] = useState<{ explanations: { claim: string; chunk_ids: string[] }[]; citations: { chunk_id: string; label: string; snippet: string }[] } | null>(null);
  const [busy, setBusy] = useState(false);

  async function ask() {
    setBusy(true); setData(null);
    try {
      const r = await fetch('/api/coach/explain', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: `${targetMuscle} 근비대를 위해 어떻게 훈련해야 하나요? 볼륨, 강도, 실패 근접도 관점에서.` }),
      });
      if (r.ok) setData(await r.json());
    } finally {
      setBusy(false);
    }
  }

  const citeIndex = (id: string) => data ? data.citations.findIndex((c) => c.chunk_id === id) + 1 : 0;

  return (
    <div style={{ marginTop: 12 }}>
      <button onClick={ask} disabled={busy}>{busy ? '근거 찾는 중…' : '왜 이 루틴? (논문 근거)'}</button>
      {data && (
        <div style={{ marginTop: 8 }}>
          {data.explanations.length === 0 && <p style={{ color: '#777' }}>근거 있는 설명을 찾지 못했어요.</p>}
          <ul>
            {data.explanations.map((e, i) => (
              <li key={i}>
                {e.claim} {e.chunk_ids.map((id) => <sup key={id}>[{citeIndex(id)}]</sup>)}
              </li>
            ))}
          </ul>
          {data.citations.length > 0 && (
            <ol style={{ fontSize: 12, color: '#555' }}>
              {data.citations.map((c) => <li key={c.chunk_id}>{c.label} — {c.snippet}…</li>)}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
```

Add `useState` is already imported. Insert `<ExplainPanel targetMuscle={res.routine.targetMuscle} />` inside the results `<div>`, after the `</ul>` of exercises.

- [ ] **Step 2: Typecheck + lint + commit**

Run: `npx tsc --noEmit && npm run lint`

```bash
git add src/components/coach/RoutineBuilder.tsx
git commit -m "feat(rag): 왜 이 루틴? cited explanation panel"
```

---

## Task 12: Eval harness

**Files:**
- Create: `evals/run-rag-eval.ts`
- Modify: `package.json` (`eval:rag`)

- [ ] **Step 1: Write the eval**

```typescript
// evals/run-rag-eval.ts
import { createClient } from '@supabase/supabase-js';
import { loadEnvLocal } from './_loadEnv';
import { getLLM } from '../src/lib/llm';
import { handleExplain, type ExplainDeps } from '../src/lib/rag/explain';
import { translateToEnglish } from '../src/lib/rag/translate';
import { embedTexts } from '../src/lib/rag/embed';
import { retrieveChunks } from '../src/lib/rag/retrieve';
import { buildExplainMessages } from '../src/lib/rag/explainPrompt';

loadEnvLocal();

interface Case { q: string; keyword: RegExp }
const CASES: Case[] = [
  { q: '근비대를 위해 주당 볼륨은 얼마나 해야 하나요', keyword: /volume|set/i },
  { q: '실패 지점까지 운동해야 하나요', keyword: /failure|effort/i },
  { q: '점진적 과부하란 무엇인가요', keyword: /overload|progress/i },
];

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const llm = getLLM();
  let pass = 0;

  for (const c of CASES) {
    let retrieved: { chunk_id: string; content: string }[] = [];
    const deps: ExplainDeps = {
      translate: (ko) => translateToEnglish(llm, ko),
      embed: async (t) => (await embedTexts([t]))[0],
      retrieve: async (emb, k) => { const r = await retrieveChunks(sb as never, emb, k); retrieved = r; return r; },
      explain: async (q, chunks) => (await llm.chat(buildExplainMessages(q, chunks), [])).content,
      labelFor: (id) => id, threshold: 0.5, k: 6,
    };
    const res = await handleExplain({ body: { question: c.q }, deps });
    const ok = res.status === 200 && 'explanations' in res.body;
    const retrievedIds = new Set(retrieved.map((r) => r.chunk_id));
    // (a) no fabricated ids, (b) keyword present in retrieved corpus
    const noFabrication = ok && 'explanations' in res.body && res.body.explanations.every((e) => e.chunk_ids.every((id) => retrievedIds.has(id)));
    const keywordHit = retrieved.some((r) => c.keyword.test(r.content));
    const good = ok && noFabrication && keywordHit;
    if (good) pass++;
    console.log(`${good ? 'PASS' : 'FAIL'} | ${c.q} | claims=${'explanations' in res.body ? res.body.explanations.length : 0} keywordHit=${keywordHit} noFabrication=${noFabrication}`);
  }
  console.log(`\n${pass}/${CASES.length} passed`);
  if (pass < CASES.length) process.exit(1);
}
main();
```

- [ ] **Step 2: Add script + run**

In `package.json`: `"eval:rag": "tsx evals/run-rag-eval.ts"`. Then `npm run eval:rag` (after ingestion) — expect all PASS.

- [ ] **Step 3: Commit**

```bash
git add evals/run-rag-eval.ts package.json
git commit -m "feat(rag): eval harness asserting grounding + retrieval"
```

---

## Task 13: Full suite + end-to-end

- [ ] **Step 1:** `npm test` → all pass (existing + `tests/rag/*`).
- [ ] **Step 2:** `npx tsc --noEmit && npm run lint` → clean.
- [ ] **Step 3:** `npm run dev`, sign in, generate a routine, click **왜 이 루틴?** → confirm cited Korean claims render with `[n]` footnotes that resolve to real papers; confirm no claim cites a chunk id absent from the citations list.
- [ ] **Step 4:** `git status` clean (ignoring `.claude/`, `scripts/`, `evals/rag-papers/`).

---

## Self-Review (completed during planning)

**Spec coverage:** pgvector + tables + match_chunks → T1; query-translation → T6; embed/retrieve → T7; explain prompt + parse → T5; grounding (anti-hallucination + containment) → T4; handleExplain core → T8; route → T9; ingestion (reproducible) → T10; UI → T11; eval → T12. ✓

**Placeholder scan:** none.

**Type consistency:** `RawExplanation` (with `evidence_en`) is internal; public `Explanation` `{claim, chunk_ids}` (Plan 1) is the only thing returned. `chunkPaper` id scheme `{paper_id}#{ordinal}-{hash8}` matches `match_chunks` return + grounding lookup. `ExplainDeps` is identical in `explain.ts`, the route, and the eval.

**Key risk + mitigation:** the LLM writes Korean claims citing English chunks, so grounding can't compare claim↔chunk directly. Resolved by the `evidence_en` field — the model supplies the English basis, and grounding checks `evidence_en` containment against the English chunk. If a claim has no honest English evidence in the retrieved set, it gets dropped (correct behavior).

**Threshold note:** `GROUNDING_THRESHOLD = 0.5` (containment) is provisional; the eval (T12) is where it gets tuned toward high precision.

