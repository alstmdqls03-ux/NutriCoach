/**
 * Ingestion — chunk + embed each paper, insert into rag_papers + rag_chunks
 * via supabase-js in batches. Requires a TEMPORARY anon insert policy on the
 * rag_* tables (added + dropped around this run); the runtime app never writes.
 * Run: npm run rag:ingest
 */
import { readFileSync, readdirSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { loadEnvLocal } from './_loadEnv';
import { chunkPaper } from '../src/lib/rag/chunk';
import { embedTexts } from '../src/lib/rag/embed';

loadEnvLocal();

const LABELS: Record<string, { title: string; label: string }> = {
  PMC8884877: { title: 'Resistance Training Volume and Muscle Hypertrophy', label: 'Baz-Valle et al. 2022' },
  PMC13215239: { title: 'Level of Effort: RT Monitoring and Prescription', label: 'Level of Effort 2025' },
  PMC13236796: { title: 'What is Resistance Exercise?', label: 'What is Resistance Exercise 2025' },
  PMC13215244: { title: 'Variable Resistance vs Free Weight Activation', label: 'Variable vs Free Weight 2025' },
};

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const dir = new URL('./rag-papers/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.txt') && !/^readme/i.test(f));

  for (const f of files) {
    const paperId = f.replace(/\.txt$/, '');
    const meta = LABELS[paperId] ?? { title: paperId, label: paperId };
    const pErr = (await sb.from('rag_papers').upsert({
      paper_id: paperId, title: meta.title, citation_label: meta.label,
      source_url: `https://www.ncbi.nlm.nih.gov/pmc/articles/${paperId}/`, license: 'PMC OA',
    }, { onConflict: 'paper_id' })).error;
    if (pErr) { console.error(`${paperId} paper insert FAILED: ${pErr.message}`); process.exit(1); }

    const chunks = chunkPaper(paperId, readFileSync(new URL(f, dir), 'utf8'));
    const vecs = await embedTexts(chunks.map((c) => c.content));
    const rows = chunks.map((c, i) => ({
      chunk_id: c.chunk_id, paper_id: c.paper_id, ordinal: c.ordinal,
      content: c.content, content_hash: c.content_hash,
      embedding: `[${vecs[i].join(',')}]`,
    }));
    for (let i = 0; i < rows.length; i += 20) {
      const cErr = (await sb.from('rag_chunks').upsert(rows.slice(i, i + 20), { onConflict: 'chunk_id' })).error;
      if (cErr) { console.error(`${paperId} chunk insert FAILED: ${cErr.message}`); process.exit(1); }
    }
    console.log(`${paperId}: ${chunks.length} chunks ingested`);
  }
  console.log('done.');
}
main().catch((e) => { console.error(e); process.exit(1); });
