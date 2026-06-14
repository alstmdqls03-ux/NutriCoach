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
