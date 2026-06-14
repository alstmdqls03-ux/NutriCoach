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
