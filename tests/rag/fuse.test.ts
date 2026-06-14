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
    // q is equidistant from A and B (both equally relevant); Adup is parallel to
    // A (a near-duplicate), B is orthogonal to A (diverse). MMR should pick B 2nd.
    const cand = [c('A'), c('Adup'), c('B')];
    const q = [1, 1];
    const emb = new Map<string, number[]>([
      ['A', [1, 0]], ['Adup', [1, 0]], ['B', [0, 1]],
    ]);
    const out = mmr(cand, q, emb, 0.7, 2);
    expect(out[0].chunk_id).toBe('A');          // first pick (tie -> order)
    expect(out[1].chunk_id).toBe('B');          // diverse, not the near-duplicate
  });
});
