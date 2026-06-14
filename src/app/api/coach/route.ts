import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import {
  supabaseLogRepository, supabaseProfileRepository, supabaseMachineAliasRepository,
} from '@/lib/repositories/supabaseRepositories';
import type { LogRepository } from '@/lib/repositories/types';
import { handleCoach } from '@/lib/coach/handlers';
import { DEFAULT_MACHINE_ALIASES, type AliasMap } from '@/lib/coach/machineMap';

export async function POST(req: Request) {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  const user = data.user;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const logs = supabaseLogRepository(sb);
  const scoped: LogRepository = { ...logs, queryLogs: (i) => logs.queryLogs({ ...i, userId: user.id }) };

  try {
    const userAliases = await supabaseMachineAliasRepository(sb).listAliases(user.id);
    const aliases: AliasMap = { ...DEFAULT_MACHINE_ALIASES };
    for (const a of userAliases) aliases[a.alias] = a.exercise_id;

    const res = await handleCoach({ body, logs: scoped, aliases });

    // Persist the gym list the user just used (best-effort; never blocks the response).
    const b = (body ?? {}) as Record<string, unknown>;
    if (res.status === 200 && Array.isArray(b.machines)) {
      const machines = b.machines.filter((m): m is string => typeof m === 'string');
      await supabaseProfileRepository(sb).setGymMachines(user.id, machines).catch(() => {});
    }
    return NextResponse.json(res.body, { status: res.status });
  } catch (e) {
    console.error('coach error', e);
    return NextResponse.json({ error: '잠시 문제가 생겼어요. 다시 시도해주세요.' }, { status: 500 });
  }
}
