import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import Chat, { type Turn } from '@/components/Chat';
import TabBar from '@/components/TabBar';
import { RoutineBuilder } from '@/components/coach/RoutineBuilder';

export default async function CoachPage() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  // Load recent visible turns so the conversation isn't blank on reload.
  // RLS scopes rows to this user. We show user messages + final assistant
  // replies (tool-call rows have tool_calls set and are skipped).
  const { data: rows } = await sb
    .from('messages')
    .select('role, content, tool_calls, created_at')
    .order('created_at', { ascending: false })
    .limit(40);

  const initialTurns: Turn[] = (rows ?? [])
    .filter((r) => r.content && (r.role === 'user' || (r.role === 'assistant' && !r.tool_calls)))
    .reverse()
    .map((r) => ({ role: r.role === 'user' ? 'user' : 'assistant', text: r.content as string }));

  return (<><RoutineBuilder /><Chat initialTurns={initialTurns} /><TabBar /></>);
}
