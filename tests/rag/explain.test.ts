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
    retrieve: async (_emb: number[], _q: string, _k: number) => chunks,
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

  it('passes the translated English query to retrieve (for FTS)', async () => {
    let seen = '';
    const d: ExplainDeps = { ...deps('{}'), retrieve: async (_e: number[], q: string) => { seen = q; return chunks; } };
    await handleExplain({ body: { question: '가슴 볼륨' }, deps: d });
    expect(seen).toBe('weekly volume hypertrophy'); // deps.translate returns this
  });
});
