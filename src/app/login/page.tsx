'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');

  async function handle(kind: 'signin' | 'signup') {
    const sb = supabaseBrowser();
    const fn = kind === 'signin'
      ? sb.auth.signInWithPassword({ email, password })
      : sb.auth.signUp({ email, password });
    const { error } = await fn;
    if (error) { setMsg(error.message); return; }
    router.push('/');
  }

  return (
    <main style={{ maxWidth: 360, margin: '80px auto', fontFamily: 'system-ui' }}>
      <h1>NutriCoach</h1>
      <input placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)}
        style={{ display: 'block', width: '100%', margin: '8px 0', padding: 8 }} />
      <input placeholder="password" type="password" value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ display: 'block', width: '100%', margin: '8px 0', padding: 8 }} />
      <button onClick={() => handle('signin')} style={{ marginRight: 8 }}>로그인</button>
      <button onClick={() => handle('signup')}>회원가입</button>
      {msg && <p style={{ color: 'crimson' }}>{msg}</p>}
    </main>
  );
}
