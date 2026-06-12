import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import {
  supabaseLogRepository, supabaseMessageRepository, supabaseProfileRepository,
} from '@/lib/repositories/supabaseRepositories';
import { getLLM } from '@/lib/llm';
import { runChat } from '@/lib/chat/orchestrator';
import { coachToolDefinitions } from '@/lib/tools/definitions';

export async function POST(req: Request) {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  const user = data.user;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const message = body?.message;
  if (typeof message !== 'string' || message.trim() === '') {
    return NextResponse.json({ error: 'message required' }, { status: 400 });
  }

  try {
    const result = await runChat({
      userId: user.id,
      userMessage: message,
      llm: getLLM(),
      logs: supabaseLogRepository(sb),
      msgs: supabaseMessageRepository(sb),
      prof: supabaseProfileRepository(sb),
      now: new Date().toISOString(),
      maxToolRounds: Number(process.env.LLM_MAX_TOOL_ROUNDS ?? 2),
      contextLimit: Number(process.env.CONTEXT_MESSAGE_LIMIT ?? 20),
      tools: coachToolDefinitions,
    });
    // Token usage logged for the price-hypothesis (see Task 13).
    console.log(JSON.stringify({ evt: 'chat_usage', userId: user.id, ...result.usage }));
    return NextResponse.json({ reply: result.reply });
  } catch (e) {
    console.error('chat error', e);
    return NextResponse.json(
      { reply: '잠시 문제가 생겼어요. 다시 한 번 말씀해 주세요.' }, { status: 200 });
  }
}
