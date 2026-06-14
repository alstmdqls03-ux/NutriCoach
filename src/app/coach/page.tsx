import '../bloom-theme.css';
import { redirect } from 'next/navigation';
import { Hanken_Grotesk } from 'next/font/google';
import { supabaseServer } from '@/lib/supabase/server';
import Chat, { type Turn } from '@/components/Chat';
import TabBar from '@/components/TabBar';
import { RoutineBuilder } from '@/components/coach/RoutineBuilder';
import { experienceFromActivity } from '@/lib/coach/experience';

const hanken = Hanken_Grotesk({ subsets: ['latin'], display: 'swap' });

export default async function CoachPage() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  // Load recent visible turns so the conversation isn't blank on reload.
  const { data: rows } = await sb
    .from('messages')
    .select('role, content, tool_calls, created_at')
    .order('created_at', { ascending: false })
    .limit(40);

  const initialTurns: Turn[] = (rows ?? [])
    .filter((r) => r.content && (r.role === 'user' || (r.role === 'assistant' && !r.tool_calls)))
    .reverse()
    .map((r) => ({ role: r.role === 'user' ? 'user' : 'assistant', text: r.content as string }));

  const { data: profile } = await sb
    .from('profiles').select('gym_machines, display_name, activity_level').eq('id', user.id).maybeSingle();
  const initialMachines = (profile?.gym_machines as string[] | null) ?? [];
  const displayName = (profile?.display_name as string | null) ?? null;
  const initialExperience = experienceFromActivity(profile?.activity_level as string | null);

  return (
    <div className={`bloom-theme ${hanken.className}`} style={{ fontFamily: hanken.style.fontFamily }}>
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '0 0 84px' }}>
        <RoutineBuilder initialMachines={initialMachines} displayName={displayName} initialExperience={initialExperience} />
        <Chat initialTurns={initialTurns} />
      </div>
      <TabBar />
    </div>
  );
}
