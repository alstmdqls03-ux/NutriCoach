# Design: RAG citation layer (왜 이 루틴? — cited explanations)

Date: 2026-06-14
Status: APPROVED (office-hours design + probe results)
Implements: the RAG half of `2026-06-14-machine-rag-coach-design.md` (the approved office-hours design). Plan 1 (deterministic engine) and make-it-stick already shipped. This fills `CoachResponse.explanations` with NotebookLM-style cited claims.

## Probe results (these drove the decisions below)

Both pre-build probes from the office-hours "Assignment" were run for real.

**Probe 1 — machine-mapping coverage.** Run on a sample list (your real gym list is still TBD). make-it-stick already added in-app 별칭 등록, so unmapped machines self-heal at runtime — this is no longer a build blocker.

**Probe 2 — cross-lingual recall (FOUNDATIONAL).** 4 open-access PMC papers embedded with `text-embedding-3-small`, fired 7 real Korean queries. Result: raw Korean→English retrieval is **marginal** (mean top-1 cosine 0.267; 2/7 queries returned off-topic top hits). Translating each query to English first lifted mean top-1 cosine to **0.557 (+109%)** and fixed the mis-ranked queries (e.g. "주당 세트 수와 근비대" 0.188→0.671, surfacing the volume paper). **Decision: v1 retrieval translates the Korean query to English before embedding. Vector-only, no FTS. Query-translation is required for v1, not a later stretch.**

## Architecture

A new `src/lib/rag/` module + a `/api/coach/explain` route. The deterministic `/api/coach` stays fast and LLM-free; explanations load on demand ("왜 이 루틴?"). Numbers are never cited (Plan 1 owns them); explanations are always cited and server-verified.

Request flow (`POST /api/coach/explain { question }`, Korean):
1. **Translate** the Korean question → English (gpt-4o-mini via the existing LLMProvider).
2. **Embed** the English question (`text-embedding-3-small`).
3. **Retrieve** top-k chunks: `sb.rpc('match_chunks', { query_embedding, match_count })`.
4. **Explain**: gpt-4o-mini gets the question + retrieved chunks, returns JSON `{ explanations: [{ claim_ko, evidence_en, chunk_ids }] }` — `claim_ko` is shown to the user, `evidence_en` is the English basis used only for grounding.
5. **Ground-verify** (server, code guarantee): drop any `chunk_id` not in the retrieved set; require token-Jaccard(`evidence_en`, cited chunk text) ≥ threshold; drop claims with an empty surviving `chunk_ids`.
6. **Return** `{ explanations: [{ claim, chunk_ids }], citations: [{ chunk_id, label, snippet }] }`.

The Korean-claim / English-evidence split is what makes the grounding check lexical and same-language (English evidence vs English chunk) even though the user reads Korean — otherwise Jaccard between a Korean claim and an English chunk is ~0.

## Data model (migration 0004, pgvector)

- `create extension if not exists vector`.
- `rag_papers (paper_id text pk, title text, citation_label text, source_url text, license text)`.
- `rag_chunks (chunk_id text pk, paper_id text references rag_papers, ordinal int, content text, content_hash text, embedding vector(1536), created_at timestamptz default now())`.
- HNSW cosine index: `create index on rag_chunks using hnsw (embedding vector_cosine_ops)`.
- RLS: enable on both; `select` policy `using (true)` for authenticated (shared read-only reference data). No write policy — ingestion runs with elevated access (Supabase MCP / service), never from the anon-key app path.
- `match_chunks(query_embedding vector(1536), match_count int)` — `stable`, `security definer`, `set search_path = public`; returns `chunk_id, paper_id, ordinal, content, similarity` ordered by `embedding <=> query_embedding` ascending, limited to `match_count`.

## Corpus & ingestion

- Corpus = 4 OA PMC papers (volume systematic review PMC8884877, level-of-effort/RIR PMC13215239, resistance-exercise fundamentals PMC13236796, muscle activation PMC13215244). Reproducible via `evals/fetch-papers.ts` (PMCIDs → NCBI BioC text API). Full texts stay gitignored under `evals/rag-papers/` (no copyrighted text committed).
- Ingestion (`evals/ingest-rag.ts`): chunk each paper (greedy paragraph packing ~1500 chars), compute `content_hash`, embed with `text-embedding-3-small`, then INSERT `rag_papers` + `rag_chunks`. Because `.env.local` has no service-role key, the embeddings are computed locally and rows inserted via Supabase MCP `execute_sql` (elevated) during the build — not from the anon app path.
- chunk_id scheme: `{paper_id}#{ordinal}-{hash8}` (deterministic; content hash invalidates stale ids on re-ingest). `section_slug` from the office-hours design is dropped — BioC passage text has no clean section slugs; ordinal + hash is sufficient and stable.

## `src/lib/rag/` units (each pure + testable where possible)

- `chunk.ts` — `chunkPaper(paperId, text): Chunk[]` with stable ids + content hash. Pure (TDD).
- `grounding.ts` — `tokenJaccard(a, b)`, `verifyExplanations(rawExplanations, retrievedChunkIds, chunkTextById, threshold): Explanation[]`. Pure (TDD). The integrity guarantee.
- `translate.ts` — `translateToEnglish(llm, korean): Promise<string>`. Uses LLMProvider (TDD with a scripted provider).
- `explainPrompt.ts` — `buildExplainMessages(question, chunks)`, `parseExplainJson(content): RawExplanation[]`. Pure (TDD) — tolerant JSON parse, ignores unknown fields.
- `embed.ts` — `embedTexts(texts): Promise<number[][]>` (OpenAI wrapper; thin).
- `retrieve.ts` — `retrieveChunks(sb, embedding, k): Promise<RetrievedChunk[]>` (rpc wrapper; thin).

Public `Explanation` stays `{ claim: string, chunk_ids: string[] }` (Plan 1's type, unchanged). `evidence_en` lives only in the internal `RawExplanation` used during verification.

## Eval harness

`evals/run-rag-eval.ts` (`npm run eval:rag`): fixed Korean questions → full pipeline. Asserts on each: (a) every returned claim's `chunk_ids` ⊆ retrieved set (no fabricated ids), (b) every claim survived grounding (non-empty), (c) ≥1 retrieved chunk contains expected keywords for the question. Integration eval (hits OpenAI + DB), like `run-extraction-eval.ts`.

## UI

`RoutineBuilder` gets a "왜 이 루틴?" button under a generated routine. It POSTs the target muscle as the question to `/api/coach/explain` and renders each `claim` with `[1][2]` footnotes; footnotes expand to `citation_label — snippet`. Citations never attach to the routine's numbers.

## Scope / non-goals

- One migration `0004_rag.sql`, additive (pgvector + 2 tables + 1 function).
- No change to Plan 1's deterministic engine or numbers.
- Not in scope: hybrid retrieval (vector + FTS + RRF), MMR diversity, corpus expansion beyond the 4 seed papers, multi-question chat over the corpus, re-embedding automation. Translation is in; FTS stays out (no Korean dictionary — the original reason).

## Testing

- Pure units (`chunk`, `grounding`, `explainPrompt`) — Vitest, no network.
- `translate` — Vitest with a scripted LLMProvider.
- Route core (`handleExplain`) — Vitest with fakes for translate/embed/retrieve/llm, asserting grounding drops fabricated ids and ungrounded claims.
- End-to-end (browser) after ingestion: "왜 이 루틴?" returns cited Korean claims; every footnote resolves to a real chunk.
