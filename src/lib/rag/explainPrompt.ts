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
