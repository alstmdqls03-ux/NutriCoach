import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseProfileRepository } from '@/lib/repositories/supabaseRepositories';

export async function POST(req: Request) {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  const user = data.user;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const raw = (body as { machines?: unknown })?.machines;
  const machines = Array.isArray(raw) ? raw.filter((m): m is string => typeof m === 'string').slice(0, 60) : [];

  try {
    await supabaseProfileRepository(sb).setGymMachines(user.id, machines);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('save machines error', e);
    return NextResponse.json({ error: '저장에 실패했어요.' }, { status: 500 });
  }
}
