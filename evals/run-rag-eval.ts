/**
 * RAG eval — fixed Korean questions through the full explain pipeline against
 * the live corpus. Asserts: no fabricated chunk_ids, and the retrieved corpus
 * actually contains the topic keyword. Run: npm run eval:rag
 */
import { createClient } from '@supabase/supabase-js';
import { loadEnvLocal } from './_loadEnv';
import { getLLM } from '../src/lib/llm';
import { handleExplain, type ExplainDeps } from '../src/lib/rag/explain';
import { translateToEnglish } from '../src/lib/rag/translate';
import { embedTexts } from '../src/lib/rag/embed';
import { retrieveChunks, hybridRetrieve } from '../src/lib/rag/retrieve';
import { buildExplainMessages } from '../src/lib/rag/explainPrompt';
import type { RetrievedChunk } from '../src/lib/rag/types';

loadEnvLocal();

interface Case { q: string; keyword: RegExp }
const CASES: Case[] = [
  { q: '근비대를 위해 주당 볼륨은 얼마나 해야 하나요', keyword: /volume|set/i },
  { q: '실패 지점까지 운동해야 하나요', keyword: /failure|effort/i },
  { q: '점진적 과부하란 무엇인가요', keyword: /overload|progress/i },
];

async function main() {
  // RLS gates rag_chunks to authenticated; sign in a throwaway user for the eval.
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const email = `ragtest+${Date.now()}@example.com`;
  await sb.auth.signUp({ email, password: 'Test1234!' });
  await sb.auth.signInWithPassword({ email, password: 'Test1234!' });

  const llm = getLLM();
  let pass = 0;

  for (const c of CASES) {
    let retrieved: RetrievedChunk[] = [];
    let lastEmbedding: number[] = [];
    const deps: ExplainDeps = {
      translate: (ko) => translateToEnglish(llm, ko),
      embed: async (t) => { lastEmbedding = (await embedTexts([t]))[0]; return lastEmbedding; },
      retrieve: async (emb, queryText, k) => { retrieved = await hybridRetrieve(sb, emb, queryText, { k }); return retrieved; },
      explain: async (q, chunks) => (await llm.chat(buildExplainMessages(q, chunks), [])).content,
      labelFor: (id) => id, threshold: 0.5, k: 6,
    };
    const res = await handleExplain({ body: { question: c.q }, deps });
    const retrievedIds = new Set(retrieved.map((r) => r.chunk_id));
    const explanations = 'explanations' in res.body ? res.body.explanations : [];
    const noFabrication = explanations.every((e) => e.chunk_ids.every((id) => retrievedIds.has(id)));
    const keywordHit = retrieved.some((r) => c.keyword.test(r.content));
    const good = res.status === 200 && noFabrication && keywordHit;
    if (good) pass++;
    console.log(`${good ? 'PASS' : 'FAIL'} | ${c.q} | claims=${explanations.length} keywordHit=${keywordHit} noFabrication=${noFabrication}`);

    // hybrid vs vector-only keyword recall (measured, not assumed)
    const vecOnly = await retrieveChunks(sb, lastEmbedding, 6);
    const hybridKw = retrieved.filter((r) => c.keyword.test(r.content)).length;
    const vecKw = vecOnly.filter((r) => c.keyword.test(r.content)).length;
    console.log(`  hybrid keyword-chunks=${hybridKw}  vector-only=${vecKw}`);
  }

  console.log(`\n${pass}/${CASES.length} passed`);
  if (pass < CASES.length) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
