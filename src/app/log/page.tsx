import { redirect } from 'next/navigation';
import { supabaseServer } from '@/lib/supabase/server';
import TabBar from '@/components/TabBar';

export default async function LogPage() {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');
  return (
    <div style={{ maxWidth: 600, margin: '40px auto', fontFamily: 'system-ui', padding: 12 }}>
      <p style={{ color: '#666' }}>기록 화면 준비 중…</p>
      <TabBar />
    </div>
  );
}
