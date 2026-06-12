import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import { supabaseLogRepository } from '@/lib/repositories/supabaseRepositories';
import { summarizeExercises, lastSessionEntries } from '@/lib/log/history';
import LogClient from '@/components/LogClient';
import TabBar from '@/components/TabBar';

const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000;

export default async function LogPage() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const since = new Date(Date.now() - SIXTY_DAYS_MS).toISOString();
  const rows = await supabaseLogRepository(sb).queryLogs({ userId: user.id, from: since });
  const exercises = summarizeExercises(rows);
  const lastSession = lastSessionEntries(rows);

  return (<><LogClient exercises={exercises} lastSession={lastSession} /><TabBar /></>);
}
