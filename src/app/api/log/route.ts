import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseLogRepository } from '@/lib/repositories/supabaseRepositories';
import { buildWorkoutData, buildSleepData, type WorkoutInput, type SleepInput } from '@/lib/log/payload';
import { computeStreakInsight } from '@/lib/insights/streak';

const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;

export async function POST(req: Request) {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  const user = data.user;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const type = body?.type;
  // Date control on the Log surface sets logged_at; default to now.
  const loggedAt = typeof body?.loggedAt === 'string' && !Number.isNaN(Date.parse(body.loggedAt))
    ? new Date(body.loggedAt).toISOString()
    : new Date().toISOString();

  const logs = supabaseLogRepository(sb);

  // Validation errors (bad/empty input) must surface as 400 with the specific
  // Korean message so the UI can show it — kept separate from the 500 DB path.
  let built: { type: 'workout' | 'sleep'; data: Record<string, unknown> };
  try {
    if (type === 'workout') built = { type: 'workout', data: buildWorkoutData(body?.data as WorkoutInput) };
    else if (type === 'sleep') built = { type: 'sleep', data: buildSleepData(body?.data as SleepInput) };
    else return NextResponse.json({ error: 'type must be workout|sleep' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  try {
    await logs.insertLog({ userId: user.id, type: built.type, data: built.data, loggedAt });
    const since = new Date(Date.parse(loggedAt) - SIXTY_DAYS_MS).toISOString();
    const recent = await logs.queryLogs({ userId: user.id, from: since });
    const insight = computeStreakInsight(recent, loggedAt);
    return NextResponse.json({ ok: true, insight });
  } catch (e) {
    console.error('log error', e);
    return NextResponse.json({ error: '저장에 실패했어요. 다시 시도해주세요.' }, { status: 500 });
  }
}

export async function DELETE() {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  const user = data.user;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const ok = await supabaseLogRepository(sb).deleteLastLog(user.id);
    return NextResponse.json({ ok });
  } catch (e) {
    console.error('log delete error', e);
    return NextResponse.json({ error: '삭제에 실패했어요.' }, { status: 500 });
  }
}
