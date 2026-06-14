# Design: Machine-constrained hypertrophy RAG coach with inline citations

Date: 2026-06-14
Status: APPROVED
Lineage: ported from the office-hours design `~/.gstack/projects/NutriCoach/seungbinmin-main-design-20260612-183035.md` (APPROVED, survived 2 adversarial review rounds). This spec is the implementation-ready form; the office-hours doc holds the full reasoning trail.
Supersedes interaction model from: `2026-06-08-nutricoach-mvp-design.md` (structured-input / conversational-output split) — this adds the RAG knowledge + coaching layer on top.

## Overview & Goal

Extend NutriCoach from a logger with a generic-LLM Coach surface into a **gym-machine-constrained hypertrophy RAG coach**: the user enters the machines available at their gym, their goal/target muscle, experience level, and workout history; the coach recommends machine exercises and routines constrained to **only those machines**, explains machine usage and hypertrophy principles, and adapts the next session's load from the user's own logged history.

The defensible product is **auditable coaching under constraint** — recommendations limited to *my* gym's machines, with every *explanatory* claim showing which exercise-DB record or research chunk it came from, NotebookLM-style. In hypertrophy (where broscience and papers conflict), provenance is the trust layer.

**Success is two-axis (both required):**
1. **Real use** — the founder pulls a machine-constrained routine for ≥1 real gym session, and the next-session load recommendation matches what they'd actually do (no obviously wrong number).
2. **RAG end-to-end** — ingestion → chunking (with metadata) → embedding into pgvector → vector retrieval → grounding-verified structured cited output → eval harness all exist and run for real (not faked).

## Scope & Non-Goals

**In scope (v1):**
- Machine-mapping layer (gym machine name → exercise-DB id, with Korean aliases).
- Deterministic routine engine (machine-filtered exercise selection + sets/reps).
- Deterministic progression engine (double progression — see below).
- `rag/` module: ingestion pipeline, **vector-only** retrieval, grounding-verified citation, eval harness.
- Inline chunk-level citations on explanatory claims, NotebookLM-style.

**Explicit non-goals (deferred):**
- **Hybrid retrieval (vector + Postgres FTS + RRF) and MMR diversity** — deferred. Postgres FTS has no Korean dictionary and cannot match Korean queries against English text, so v1 is vector-only. Hybrid is a later learning stretch and requires query-translation-to-English first.
- Corpus expansion beyond the 3–5 seed papers — expand only when retrieval quality is visibly lacking.
- Meal planning, periodization, multi-week mesocycle design, chat polish.
- RIR/RPE-logged progression (v1 progression reads logged reps only; see Progression Rule).

## Constraints

- Stack: Next.js 14 App Router (TS), Supabase (Postgres + RLS), OpenAI `gpt-4o-mini` behind the existing `LLMProvider` abstraction.
- Embedding store: **pgvector on the existing Supabase Postgres** — no new infrastructure.
- Embedding model: **`text-embedding-3-small`** (cross-lingual, low cost). Decided; not an open question.
- Data model: existing `logs` (type + jsonb), `profiles`, `messages` untouched. New RAG + mapping tables added via **non-destructive** migration.
- Accuracy non-negotiable: a fabricated citation or a wrong number undoes the trust the recent QA work (date-range, duplicate, history-replay fixes) earned.

## Architecture

Three cooperating units, each independently understandable and testable:

### 1. Deterministic engine (`lib/coach/`, code-only, no LLM, no citations)
- **Machine filter:** given the user's mapped machine ids + target muscle, select candidate exercises from the exercise-DB records.
- **Routine builder:** assemble sets/reps per exercise (volume caps, rep ranges, rest).
- **Progression engine:** read last logged session for each machine → produce next-session prescription via double progression.
- Reuses NutriCoach's existing `computeInsight`/`applySafety` deterministic-split pattern. **Numbers are owned here and never carry a citation.**

### 2. Machine-mapping layer (`lib/coach/machine-map`)
- A first-class table mapping a gym machine name (incl. Korean aliases: 펙덱, 시티드로우, 랫풀다운, …) → `free-exercise-db` exercise id.
- **Runtime miss behavior:** if an entered or logged machine has no DB id, it is **excluded from the routine with a visible `미매핑: <name>` note** plus an inline `별칭 등록` prompt — never silently dropped, never substituted with a machine the user doesn't have.

### 3. `rag/` module (the learning core)
- **Ingestion pipeline:** PMC XML/HTML extract → section-aware chunker (300–600 tokens, ~50 overlap, never strip citation metadata) → embedding job → pgvector upsert.
- **Retrieval:** v1 vector-only — `text-embedding-3-small` over pgvector, cosine distance, top-k.
- **Citation/grounding:** structured `CoachResponse`, server-side grounding verification, citation renderer.
- **Eval harness:** golden prompt set + the four assertions below.

Data flow: `user input (machines + goal + history)` → deterministic engine produces `routine` + `progression` → retrieval fetches chunks for the explanation queries → LLM phrases `explanations[]` citing only retrieved chunk_ids → grounding verifier filters → renderer shows plain numbers + cited explanations.

## Data Model (new, additive)

Requires the **pgvector extension** enabled on the Supabase project (check `list_extensions`; enable via migration if absent).

- `rag_chunks` — `chunk_id` (PK, see scheme), `paper_id`, `section_slug`, `ordinal`, `content`, `content_hash`, `embedding vector`, `metadata jsonb`.
- `exercise_records` — `free-exercise-db` rows imported as structured records (primary/secondary muscle, equipment).
- `machine_aliases` — `alias` (incl. Korean), `exercise_id`, `user_id` (nullable for global aliases), RLS-scoped.

No change to `logs`, `profiles`, `messages`. Migration is non-destructive.

## Output Schema — `CoachResponse` (the heart of the design; enforces P3 + P5)

```
CoachResponse {
  routine:      ComputedRoutine        // exercises (machine-filtered), sets, reps — code only, NO citations
  progression:  ComputedProgression    // next-session load from history — code only, NO citations
  explanations: Explanation[]          // each: { claim: string, chunk_ids: string[] } — citations REQUIRED
}
```

The renderer shows numbers plainly (from `routine`/`progression`) and renders each `explanation` with its inline citation. **A paper supports a general principle ("weekly volume of ~10–20 sets per muscle drives hypertrophy"); it does NOT support the exact prescription ("do 42.5kg for 3×10").** The exact number is owned by the deterministic rule. Numbers never carry a paper citation — conflating the two creates fake authority and is prevented by the schema split.

## Grounding Verification (do NOT trust model-emitted chunk_ids)

`gpt-4o-mini` will hallucinate chunk_id attributions, so a non-empty `chunk_ids` array is not automatically trustworthy. Before rendering, the server-side pipeline must:

1. **Reject** any chunk_id the model returns that was **not in the actually-retrieved set** for that query (the model can only cite what it was given).
2. **Grounding check** — token/keyword overlap between `claim` text and the cited chunk text. Below threshold → the claim is **dropped, not rendered**. v1 threshold: a **conservative token-Jaccard floor** (provisional), tuned against the eval set toward high precision (drop borderline claims).
3. **Drop** any claim left with an empty (or fully-rejected) `chunk_ids` array before rendering.

This makes citation integrity a **code guarantee, not a prompt hope** — the same discipline as P3/P5 for numbers.

## chunk_id Scheme + Re-ingestion Contract

Chunk ids are deterministic: `{paper_id}#{section_slug}#{ordinal}` plus a content-hash suffix — e.g. `schoenfeld2017#volume-methods#003-a1b2`. Re-ingestion with unchanged source text reproduces the same ids; if a chunk's text changes, its hash changes and any cached response referencing the old id is invalidated. The eval assertions and the renderer all key on these stable ids.

**Citation label.** Internally a claim carries the global chunk_id(s); the user-facing label is a per-response ordinal footnote (`[1]`, `[2]`) expanding to `Author Year — section`. The ordinal↔chunk_id map is built per response so the same global chunk gets one stable footnote number within a response.

## Retrieval Mechanics (v1 decision)

v1 is **vector-only**: `text-embedding-3-small` over pgvector with cosine distance. This is the deliberate cut for the Korean-input / English-corpus problem — embeddings are cross-lingual enough that a Korean query ("가슴 볼륨 얼마나") retrieves relevant English chunks, whereas **Postgres FTS has no Korean dictionary and will not match Korean queries against English text at all.** Hybrid + MMR is a deferred learning stretch; when built it requires translating the query to English first.

This cross-lingual assumption is **unproven for this corpus** and is de-risked by a pre-build probe (see The Assignment). Fallback if recall is poor: query-translate-to-English before embedding — cheap, becomes part of v1.

## Progression Rule (v1, locked — double progression)

The code that turns last session's logged sets into next session's prescription. Output lands in `ComputedProgression` — **code-owned, never cited.**

- Each exercise carries a target rep range (default **8–12**, configurable per exercise).
- Read the most recent logged session for that machine.
- **All working sets hit the top of the range (≥12)** at the prescribed load → next session **+2.5 kg (upper-body machines) / +5 kg (lower-body machines, e.g. leg press)**, reps reset to the **bottom (8)**.
- **Some sets inside the range** → **hold weight, add 1 rep per set** toward the top.
- **Any set below the bottom (<8)** → **hold, or drop −2.5/−5 kg** until the bottom is reachable.
- **Cold start (no history)** → user-entered light/moderate/heavy estimate; copy: "오늘 기록하면 다음엔 기록 기반으로 추천." The history→load wow-moment fires from session 2.

## Corpus Seed (3–5 open-access papers)

Start small; expand only when retrieval quality is visibly lacking. Candidate seed:
- Schoenfeld et al. volume meta-analysis (PMC8884877).
- Schoenfeld frequency review.
- A progressive-overload / RIR–RPE source.

Ingest from **PMC XML/HTML full text, not PDF** (PDF column/table/reference parsing is brittle; ingestion has an explicit extract step before chunking). **License confirmation (CC) + PMC XML availability is a pre-build probe**, not a build assumption.

## Eval Harness (golden set + four assertions)

On a fixed eval set of real Korean prompts, assert:
- **(a)** Zero exercises recommended outside the user's machine list.
- **(b)** Every rendered explanatory claim has ≥1 chunk_id that was **actually in the retrieved set** (server-verified, not model-asserted) and passes the grounding overlap check.
- **(c)** Zero load/set/rep numbers appear except from deterministic code.
- **(d)** Retrieved chunks contain the relevant entities/keywords above the grounding threshold.

## The Assignment (two pre-build probes — run before writing RAG code)

Both convert the biggest unknowns into concrete numbers. Do them in one sitting.

1. **Machine-mapping probe (P2):** list every machine in the actual gym, hand-map each to a `free-exercise-db` exercise id. Count clean maps vs. need-a-Korean-alias vs. no-match. If >15–20% don't map, the machine-mapping layer is the first real build, not an afterthought. ~30–45 min.
2. **Cross-lingual recall probe (retrieval foundation):** embed the 3–5 candidate papers with `text-embedding-3-small` into pgvector, fire 5–10 real Korean questions ("가슴 볼륨 얼마나 해야 해", "초보 빈도"), eyeball top-k relevance. If recall is poor, add query-translate-to-English before embedding (becomes part of v1). ~45–60 min.

A third lightweight check rides along: **confirm the 3–5 seed papers are CC-licensed and have PMC XML/HTML full text** before ingesting.

## Build Order

1. **Deterministic engine + machine-mapping** first (gym-usable within a day or two as a single product — real-use feedback early).
2. **`rag/` ingestion → vector retrieval → grounding-verified citation → eval** on top.

This borrows Approach C's discipline (real-use feedback before the RAG bet) without splitting into two separate products — it is all Approach B's structure (routine/progression = computed fields; explanations = cited array).

## Dependencies

- pgvector extension enabled on Supabase.
- `yuhonas/free-exercise-db` JSON imported as `exercise_records`.
- 3–5 confirmed CC-licensed papers, ingested from PMC XML/HTML.
- `text-embedding-3-small` wired behind the existing provider abstraction.
- A one-time corpus-ingestion script/job (local or Supabase edge function) to populate the pgvector tables.

## Deferred / Future

- Hybrid retrieval (vector + Postgres FTS + RRF) + MMR diversity, with query-translation.
- Corpus expansion beyond seed.
- RIR/RPE-logged progression precision.
