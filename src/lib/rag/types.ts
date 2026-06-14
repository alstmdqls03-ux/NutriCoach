import type { Explanation } from '@/lib/coach/types';

export interface Chunk {
  chunk_id: string;
  paper_id: string;
  ordinal: number;
  content: string;
  content_hash: string;
}

export interface RetrievedChunk {
  chunk_id: string;
  paper_id: string;
  ordinal: number;
  content: string;
  similarity: number;
}

/** What the LLM emits per explanation. evidence_en is English, used only for grounding. */
export interface RawExplanation {
  claim_ko: string;
  evidence_en: string;
  chunk_ids: string[];
}

export interface Citation {
  chunk_id: string;
  label: string;   // citation_label + '#' + ordinal
  snippet: string; // short chunk excerpt
}

export interface ExplainResult {
  explanations: Explanation[];  // { claim, chunk_ids } — claim is Korean, shown to user
  citations: Citation[];
}
