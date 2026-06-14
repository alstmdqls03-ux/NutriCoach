/**
 * Reproducible corpus fetch — PMCIDs -> NCBI BioC text -> evals/rag-papers/*.txt.
 * Run: npm run rag:fetch  (full texts stay gitignored)
 */
import { writeFileSync } from 'node:fs';

const PMCIDS = ['PMC8884877', 'PMC13215239', 'PMC13236796', 'PMC13215244'];

interface Passage { text?: string; infons?: Record<string, string>; }
function extract(bioc: unknown): string {
  const arr = bioc as Array<{ documents?: Array<{ passages?: Passage[] }> }>;
  const docs = Array.isArray(arr) ? (arr[0]?.documents ?? []) : [];
  const paras: string[] = [];
  for (const doc of docs) for (const p of doc.passages ?? []) {
    const sec = (p.infons?.section_type || p.infons?.type || '').toUpperCase();
    if (sec.includes('REF') || sec === 'TABLE' || sec === 'FIG') continue;
    const t = (p.text ?? '').trim();
    if (t) paras.push(t);
  }
  return paras.join('\n\n');
}

async function main() {
  const dir = new URL('./rag-papers/', import.meta.url);
  for (const id of PMCIDS) {
    const res = await fetch(`https://www.ncbi.nlm.nih.gov/research/bionlp/RESTful/pmcoa.cgi/BioC_json/${id}/unicode`);
    if (!res.ok) { console.log(`${id}: FETCH ${res.status}`); continue; }
    const text = extract(await res.json());
    if (text.length < 2000) { console.log(`${id}: too short (${text.length})`); continue; }
    writeFileSync(new URL(`${id}.txt`, dir), text, 'utf8');
    console.log(`${id}: saved ${text.length} chars`);
  }
}
main();
