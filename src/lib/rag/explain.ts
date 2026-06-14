import type { RetrievedChunk, Citation, ExplainResult } from './types';
import { verifyExplanations } from './grounding';
import { parseExplainJson } from './explainPrompt';

export interface ExplainDeps {
  translate: (korean: string) => Promise<string>;
  embed: (text: string) => Promise<number[]>;
  retrieve: (embedding: number[], queryText: string, k: number) => Promise<RetrievedChunk[]>;
  explain: (question: string, chunks: RetrievedChunk[]) => Promise<string | null>;
  labelFor: (paperId: string) => string;  // paper_id -> citation label
  threshold: number;
  k: number;
}

export interface ExplainArgs { body: unknown; deps: ExplainDeps; }
export interface ExplainHandlerResult { status: number; body: ExplainResult | { error: string }; }

export async function handleExplain({ body, deps }: ExplainArgs): Promise<ExplainHandlerResult> {
  const question = typeof (body as Record<string, unknown>)?.question === 'string'
    ? ((body as Record<string, unknown>).question as string).trim() : '';
  if (!question) return { status: 400, body: { error: '질문을 입력해주세요.' } };

  const en = await deps.translate(question);
  const embedding = await deps.embed(en);
  const chunks = await deps.retrieve(embedding, en, deps.k);

  const retrievedIds = new Set(chunks.map((c) => c.chunk_id));
  const textById = new Map(chunks.map((c) => [c.chunk_id, c.content]));

  const llmJson = await deps.explain(question, chunks);
  const raw = parseExplainJson(llmJson);
  const explanations = verifyExplanations(raw, retrievedIds, textById, deps.threshold);

  const usedIds = new Set(explanations.flatMap((e) => e.chunk_ids));
  const citations: Citation[] = chunks
    .filter((c) => usedIds.has(c.chunk_id))
    .map((c) => ({
      chunk_id: c.chunk_id,
      label: `${deps.labelFor(c.paper_id)}#${c.ordinal}`,
      snippet: c.content.slice(0, 160),
    }));

  return { status: 200, body: { explanations, citations } };
}
