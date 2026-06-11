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

  try {
    if (type === 'workout') {
      const logType = 'workout' as const;
      const payload = buildWorkoutData(body?.data as WorkoutInput);
      await logs.insertLog({ userId: user.id, type: logType, data: payload, loggedAt });
    } else if (type === 'sleep') {
      const logType = 'sleep' as const;
      const payload = buildSleepData(body?.data as SleepInput);
      await logs.insertLog({ userId: user.id, type: logType, data: payload, loggedAt });
    } else {
      return NextResponse.json({ error: 'type must be workout|sleep' }, { status: 400 });
    }

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
