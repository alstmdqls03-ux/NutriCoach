import { createHash } from 'node:crypto';
import type { Chunk } from './types';

const TARGET_CHARS = 1500;

function hash8(s: string): string {
  return createHash('sha256').update(s).digest('hex').slice(0, 8);
}

/** Greedy paragraph packing into ~TARGET_CHARS chunks with deterministic ids. */
export function chunkPaper(paperId: string, text: string): Chunk[] {
  const paras = text.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const out: Chunk[] = [];
  let buf = '';
  let ordinal = 0;
  const flush = () => {
    if (!buf) return;
    const content_hash = hash8(buf);
    out.push({
      chunk_id: `${paperId}#${ordinal}-${content_hash}`,
      paper_id: paperId, ordinal, content: buf, content_hash,
    });
    ordinal++;
    buf = '';
  };
  for (const p of paras) {
    if (buf && buf.length + p.length > TARGET_CHARS) flush();
    buf = buf ? `${buf} ${p}` : p;
  }
  flush();
  return out;
}
