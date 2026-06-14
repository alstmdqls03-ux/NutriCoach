import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { getLLM } from '@/lib/llm';
import { handleExplain, type ExplainDeps } from '@/lib/rag/explain';
import { translateToEnglish } from '@/lib/rag/translate';
import { embedTexts } from '@/lib/rag/embed';
import { hybridRetrieve } from '@/lib/rag/retrieve';
import { buildExplainMessages } from '@/lib/rag/explainPrompt';

const GROUNDING_THRESHOLD = 0.5; // provisional; tune via eval
const TOP_K = 6;

export async function POST(req: Request) {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  if (!data.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const llm = getLLM();

  // Paper labels for citations (small table; fetch once per request).
  const { data: papers } = await sb.from('rag_papers').select('paper_id,citation_label');
  const labels = new Map((papers ?? []).map((p) => [p.paper_id as string, p.citation_label as string]));

  const deps: ExplainDeps = {
    translate: (ko) => translateToEnglish(llm, ko),
    embed: async (t) => (await embedTexts([t]))[0],
    retrieve: (emb, queryText, k) => hybridRetrieve(sb, emb, queryText, { k }),
    explain: async (q, chunks) => (await llm.chat(buildExplainMessages(q, chunks), [])).content,
    labelFor: (id) => labels.get(id) ?? id,
    threshold: GROUNDING_THRESHOLD,
    k: TOP_K,
  };

  try {
    const res = await handleExplain({ body, deps });
    return NextResponse.json(res.body, { status: res.status });
  } catch (e) {
    console.error('explain error', e);
    return NextResponse.json({ error: '설명을 생성하지 못했어요.' }, { status: 500 });
  }
}
