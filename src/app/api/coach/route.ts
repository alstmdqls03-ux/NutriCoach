import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseLogRepository } from '@/lib/repositories/supabaseRepositories';
import type { LogRepository } from '@/lib/repositories/types';
import { buildCoachResponse } from '@/lib/coach';
import type { CoachInput, CoachResponse, Experience } from '@/lib/coach/types';

const EXPERIENCES: Experience[] = ['beginner', 'intermediate', 'advanced'];

export interface CoachHandlerArgs {
  body: unknown;
  logs: LogRepository;
}
export interface CoachHandlerResult {
  status: number;
  body: CoachResponse | { error: string };
}

/** Pure core: validate input, read history, assemble response. Unit-testable. */
export async function handleCoach({ body, logs }: CoachHandlerArgs): Promise<CoachHandlerResult> {
  const b = (body ?? {}) as Record<string, unknown>;
  const machines = Array.isArray(b.machines) ? b.machines.filter((m): m is string => typeof m === 'string') : [];
  const targetMuscle = typeof b.targetMuscle === 'string' ? b.targetMuscle : '';
  const experience = EXPERIENCES.includes(b.experience as Experience) ? (b.experience as Experience) : null;

  if (machines.length === 0) return { status: 400, body: { error: '머신 목록을 입력해주세요.' } };
  if (!targetMuscle) return { status: 400, body: { error: '타겟 부위를 입력해주세요.' } };
  if (!experience) return { status: 400, body: { error: '경험 수준을 선택해주세요.' } };

  const input: CoachInput = {
    machines, targetMuscle, experience,
    estimate: typeof b.estimate === 'string' ? (b.estimate as CoachInput['estimate']) : undefined,
  };
  const history = await logs.queryLogs({ userId: '_self', type: 'workout' });
  return { status: 200, body: buildCoachResponse(input, history) };
}

export async function POST(req: Request) {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  const user = data.user;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  // The repository is RLS-scoped to the signed-in user; pass the real userId.
  const logs = supabaseLogRepository(sb);
  const scoped: LogRepository = { ...logs, queryLogs: (i) => logs.queryLogs({ ...i, userId: user.id }) };

  try {
    const res = await handleCoach({ body, logs: scoped });
    return NextResponse.json(res.body, { status: res.status });
  } catch (e) {
    console.error('coach error', e);
    return NextResponse.json({ error: '잠시 문제가 생겼어요. 다시 시도해주세요.' }, { status: 500 });
  }
}
