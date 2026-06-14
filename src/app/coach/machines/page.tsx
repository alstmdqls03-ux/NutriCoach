import '../../bloom-theme.css';
import { redirect } from 'next/navigation';
import { Hanken_Grotesk } from 'next/font/google';
import { supabaseServer } from '@/lib/supabase/server';
import { MachinePicker } from '@/components/coach/MachinePicker';

const hanken = Hanken_Grotesk({ subsets: ['latin'], display: 'swap' });

export default async function MachinesPage() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await sb.from('profiles').select('gym_machines').eq('id', user.id).maybeSingle();
  const initialSelected = (profile?.gym_machines as string[] | null) ?? [];

  return (
    <div className={`bloom-theme ${hanken.className}`} style={{ fontFamily: hanken.style.fontFamily }}>
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <MachinePicker initialSelected={initialSelected} />
      </div>
    </div>
  );
}
