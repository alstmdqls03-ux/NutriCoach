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
  return Array.from(rep.values()).sort((a, b) => (score.get(b.chunk_id) ?? 0) - (score.get(a.chunk_id) ?? 0));
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
