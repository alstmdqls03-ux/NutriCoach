import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseMachineAliasRepository } from '@/lib/repositories/supabaseRepositories';
import type { MachineAliasRepository } from '@/lib/repositories/types';
import { handleAddAlias } from '@/lib/coach/handlers';

export async function POST(req: Request) {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  const user = data.user;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const base = supabaseMachineAliasRepository(sb);
  // RLS-scope addAlias to the signed-in user.
  const scoped: MachineAliasRepository = {
    ...base,
    addAlias: (_u, alias, exerciseId) => base.addAlias(user.id, alias, exerciseId),
  };
  const res = await handleAddAlias({ body, aliases: scoped });
  return NextResponse.json(res.body, { status: res.status });
}
