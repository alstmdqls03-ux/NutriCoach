# Design: Hybrid retrieval (vector + FTS + RRF + MMR)

Date: 2026-06-14
Status: APPROVED
Builds on: `2026-06-14-rag-citation-layer-design.md` (Plan 2, shipped). Replaces the vector-only retrieval step with hybrid retrieval. The office-hours design parked this as a "later learning stretch"; it is now unblocked because the query is translated to English before retrieval (the original Korean-FTS-dictionary blocker is gone).

## Problem

v1 retrieval is vector-only (`match_chunks`, cosine top-k). It works (Plan 2 eval 3/3), but it misses the lexical-exactness that full-text search catches (exact terms like "RIR", "1RM", specific muscle names) and has no diversity control, so top-k can be near-duplicate chunks from one paper. The RAG-depth learning goal calls for hybrid retrieval: fuse vector + keyword search, then diversify.

## Decision

Replace the single vector retrieval in `/api/coach/explain` with a hybrid pipeline. Only the retrieval step changes; translate→embed upstream and explain→ground downstream are untouched.

```
translate KO→EN ─┬─ vector (match_chunks, cosine)     top-N ─┐
                 └─ FTS    (match_chunks_fts, english)  top-N ─┤ RRF fuse → top-M ─ MMR re-rank → top-k → LLM
```

- **Vector**: existing `match_chunks(embedding, N)`.
- **FTS**: new `match_chunks_fts(query_text, N)` — `websearch_to_tsquery('english', query)` over a stored `tsvector`, ranked by `ts_rank_cd`. Runs on the English-translated query against English chunks.
- **RRF (Reciprocal Rank Fusion)**: `score(d) = Σ_lists 1/(k_rrf + rank_list(d))`, `k_rrf = 60`. Combines the two rankings without needing comparable raw scores (cosine vs ts_rank are not comparable; rank is).
- **MMR (Maximal Marginal Relevance)**: re-rank the fused top-M for diversity. Iteratively pick `argmax [ λ·rel(d) − (1−λ)·max_{s∈selected} sim(d, s) ]`, `λ = 0.7`, where `rel` and `sim` are embedding cosine. Needs candidate embeddings (fetched for the fused set).

Defaults: N=15 per retriever, M=12 fused, k=6 final.

## Data model (migration 0006)

- `alter table rag_chunks add column content_tsv tsvector generated always as (to_tsvector('english', content)) stored;`
- `create index rag_chunks_tsv_idx on rag_chunks using gin (content_tsv);`
- `match_chunks_fts(query text, match_count int)` — returns `chunk_id, paper_id, ordinal, content, similarity` (similarity = `ts_rank_cd`); `where content_tsv @@ websearch_to_tsquery('english', query)` order by rank desc limit match_count. `language sql stable security invoker set search_path = public` (authenticated read policy covers it); revoke execute from public/anon, grant to authenticated — same posture as `match_chunks` after 0005.

Additive, non-destructive. The generated column backfills existing 104 chunks automatically.

## Modules

- `src/lib/rag/fuse.ts` (pure, TDD):
  - `cosine(a, b): number`.
  - `reciprocalRankFusion(lists: RetrievedChunk[][], kRrf?): RetrievedChunk[]` — fused, sorted desc; dedupes by chunk_id keeping the first-seen chunk.
  - `mmr(candidates, queryEmbedding, embById, lambda, k): RetrievedChunk[]` — diversity re-rank; relevance and pairwise similarity both via `cosine` on embeddings.
- `src/lib/rag/retrieve.ts` (extend):
  - `retrieveChunksFts(sb, query, k): Promise<RetrievedChunk[]>` (rpc wrapper).
  - `fetchEmbeddings(sb, ids): Promise<Map<string, number[]>>` (parses the pgvector string form).
  - `hybridRetrieve(sb, queryEmbedding, queryText, opts): Promise<RetrievedChunk[]>` — vector + FTS → RRF → fetch embeddings → MMR → top-k.
- `ExplainDeps.retrieve` signature grows the English query text: `retrieve(embedding, queryText, k)`. Threaded through `explain.ts`, the route, and the eval. The DI core stays unit-testable (fake retrieve).

## Eval

Extend `run-rag-eval.ts` to run BOTH vector-only and hybrid for each case and print a comparison (keyword hit + which retrieved the most on-topic chunks). The assertion stays: no fabricated chunk_ids, keyword present. The comparison makes the hybrid improvement measured, not assumed.

## Scope / non-goals

- One migration `0006_rag_fts.sql`, additive.
- No change to translation, embedding, grounding, citation schema, or the deterministic engine.
- Not in scope: tuning k_rrf/λ/N beyond the stated defaults (a later eval-driven pass), free-text questions, corpus curation.

## Testing

- `cosine`, `reciprocalRankFusion`, `mmr` — pure Vitest (fusion ordering, dedupe, MMR diversity picks a dissimilar second doc over a near-duplicate).
- `hybridRetrieve` — light integration via fakes for the two retrievers + embedding fetch.
- End-to-end: `npm run eval:rag` shows hybrid ≥ vector-only on keyword recall; browser "왜 이 루틴?" still renders cited claims.
