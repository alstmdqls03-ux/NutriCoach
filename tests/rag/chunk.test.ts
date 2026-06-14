import { describe, it, expect } from 'vitest';
import { chunkPaper } from '@/lib/rag/chunk';

describe('chunkPaper', () => {
  const text = 'Para one about volume.\n\nPara two about frequency.\n\n' + 'x'.repeat(1600) + '\n\nPara four.';

  it('produces stable, unique chunk ids prefixed by paper id', () => {
    const chunks = chunkPaper('PMC1', text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.chunk_id.startsWith('PMC1#')).toBe(true);
    expect(new Set(chunks.map((c) => c.chunk_id)).size).toBe(chunks.length);
  });

  it('is deterministic — same input reproduces same ids + hashes', () => {
    expect(chunkPaper('PMC1', text)).toEqual(chunkPaper('PMC1', text));
  });

  it('changes the hash (and id) when content changes', () => {
    const a = chunkPaper('PMC1', 'hello world')[0];
    const b = chunkPaper('PMC1', 'hello there')[0];
    expect(a.content_hash).not.toBe(b.content_hash);
    expect(a.chunk_id).not.toBe(b.chunk_id);
  });

  it('packs short paragraphs together but splits past the size target', () => {
    const chunks = chunkPaper('PMC1', text);
    expect(chunks.some((c) => c.content.length > 1000)).toBe(true);
  });
});
