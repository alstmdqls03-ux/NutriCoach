/**
 * Probe 2 — Cross-lingual recall (spec: The Assignment, v1 retrieval).
 *
 * The whole v1 demo rests on "a Korean query retrieves relevant English chunks"
 * via text-embedding-3-small. This is plausible but unproven for THIS corpus.
 * This probe embeds your candidate papers, fires real Korean queries, and prints
 * the top-k chunks per query so you can eyeball recall@k. If recall is poor, add
 * query-translate-to-English before embedding — that becomes part of v1.
 *
 * Setup:
 *   1. Drop 3-5 paper full-texts as .txt or .md files into evals/rag-papers/
 *      (PMC XML/HTML stripped to text is ideal; plain prose is fine for a probe).
 *   2. Edit evals/rag-queries.txt with the Korean questions you care about.
 *   3. Run:  npm run probe:recall
 *
 * No pgvector needed — similarity is computed in-memory (this is a probe, not
 * the production retrieval path).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import OpenAI from 'openai';
import { loadEnvLocal } from './_loadEnv';

loadEnvLocal();

const EMBED_MODEL = 'text-embedding-3-small';
const TARGET_CHARS = 1500; // ~400 tokens per chunk
const TOP_K = 5;

interface Chunk { paper: string; ordinal: number; text: string; }

function papersDir(): string {
  return fileURLToPath(new URL('./rag-papers/', import.meta.url));
}

function loadPapers(): { paper: string; text: string }[] {
  const dir = papersDir();
  let files: string[];
  try {
    files = readdirSync(dir).filter(
      (f) => (f.endsWith('.txt') || f.endsWith('.md')) && !/^readme/i.test(f),
    );
  } catch {
    return [];
  }
  return files.map((f) => ({ paper: f, text: readFileSync(dir + f, 'utf8') }));
}

/** Greedy paragraph packing into ~TARGET_CHARS chunks (section-aware-ish probe chunker). */
function chunkText(paper: string, text: string): Chunk[] {
  const paras = text.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const chunks: Chunk[] = [];
  let buf = '';
  let ord = 0;
  for (const p of paras) {
    if (buf && buf.length + p.length > TARGET_CHARS) {
      chunks.push({ paper, ordinal: ord++, text: buf });
      buf = '';
    }
    buf = buf ? `${buf} ${p}` : p;
  }
  if (buf) chunks.push({ paper, ordinal: ord++, text: buf });
  return chunks;
}

function readQueries(): string[] {
  const url = new URL('./rag-queries.txt', import.meta.url);
  let txt: string;
  try {
    txt = readFileSync(url, 'utf8');
  } catch {
    return [];
  }
  return txt.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

async function embedAll(client: OpenAI, inputs: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < inputs.length; i += 100) {
    const batch = inputs.slice(i, i + 100);
    const res = await client.embeddings.create({ model: EMBED_MODEL, input: batch });
    for (const d of res.data) out.push(d.embedding as number[]);
  }
  return out;
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY not found (checked env + .env.local).');
    process.exit(1);
  }
  const papers = loadPapers();
  if (papers.length === 0) {
    console.error('No papers in evals/rag-papers/. Drop 3-5 .txt/.md full-texts there first (see evals/rag-papers/README.md).');
    process.exit(1);
  }
  const queries = readQueries();
  if (queries.length === 0) {
    console.error('No queries in evals/rag-queries.txt.');
    process.exit(1);
  }

  const chunks = papers.flatMap((p) => chunkText(p.paper, p.text));
  console.log(`Papers: ${papers.length}   Chunks: ${chunks.length}   Queries: ${queries.length}`);
  console.log(`Embedding with ${EMBED_MODEL} …\n`);

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const chunkVecs = await embedAll(client, chunks.map((c) => c.text));
  const queryVecs = await embedAll(client, queries);

  for (let qi = 0; qi < queries.length; qi++) {
    const scored = chunks
      .map((c, ci) => ({ c, score: cosine(queryVecs[qi], chunkVecs[ci]) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, TOP_K);

    console.log(`\n──────────────────────────────────────────────`);
    console.log(`Q: ${queries[qi]}`);
    for (const { c, score } of scored) {
      const preview = c.text.slice(0, 140).replace(/\s+/g, ' ');
      console.log(`  [${score.toFixed(3)}] ${c.paper}#${c.ordinal}  ${preview}…`);
    }
  }

  console.log(`\n──────────────────────────────────────────────`);
  console.log('Eyeball each query: are the top chunks actually about what you asked?');
  console.log('If many top hits are off-topic, recall is poor → add query-translate-to-English');
  console.log('before embedding (cheap) and re-run. That becomes part of v1 retrieval.');
}

main().catch((e) => { console.error(e); process.exit(1); });
