import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';
import { handleExercises } from '@/lib/coach/handlers';

export async function GET(req: Request) {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  if (!data.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const muscle = new URL(req.url).searchParams.get('muscle');
  const res = handleExercises(muscle);
  return NextResponse.json(res.body, { status: res.status });
}
