import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseProfileRepository } from '@/lib/repositories/supabaseRepositories';
import { handleOnboarding } from '@/lib/onboarding';

export async function POST(req: Request) {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  const user = data.user;
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  try {
    await handleOnboarding(body, supabaseProfileRepository(sb), user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('onboarding error', e);
    return NextResponse.json({ error: '저장에 실패했어요.' }, { status: 500 });
  }
}
