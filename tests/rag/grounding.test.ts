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
  it('ignores stopwords (all-stopword evidence -> 0)', () => {
    expect(tokenContainment('the of and', 'training volume')).toBe(0);
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
