'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function handle(kind: 'signin' | 'signup') {
    if (busy) return;
    setMsg('');
    setBusy(true);
    try {
      const sb = supabaseBrowser();

      if (kind === 'signup') {
        const { data, error } = await sb.auth.signUp({ email, password });
        if (error) { setMsg(error.message); return; }
        // If email confirmation is ON, signUp returns no session — don't bounce to /.
        if (!data.session) {
          setMsg(
            '가입 완료! 이메일 인증 링크를 확인한 뒤 로그인하세요. ' +
            '(개발 중이면 Supabase → Authentication → Sign In/Providers → Email → "Confirm email"을 끄면 인증 없이 바로 로그인됩니다.)',
          );
          return;
        }
      } else {
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) { setMsg(error.message); return; }
        if (!data.session) { setMsg('로그인에 실패했어요. 다시 시도해주세요.'); return; }
      }

      // Session exists → refresh so server components pick up the new cookie, then go home.
      router.refresh();
      router.push('/');
    } catch (e) {
      setMsg((e as Error).message ?? '알 수 없는 오류가 발생했어요.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 360, margin: '80px auto', fontFamily: 'system-ui' }}>
      <h1>NutriCoach</h1>
      <input
        placeholder="email" type="email" value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handle('signin')}
        style={{ display: 'block', width: '100%', margin: '8px 0', padding: 8 }}
      />
      <input
        placeholder="password" type="password" value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handle('signin')}
        style={{ display: 'block', width: '100%', margin: '8px 0', padding: 8 }}
      />
      <button onClick={() => handle('signin')} disabled={busy} style={{ marginRight: 8 }}>
        로그인
      </button>
      <button onClick={() => handle('signup')} disabled={busy}>회원가입</button>
      {msg && <p style={{ color: msg.startsWith('가입 완료') ? 'green' : 'crimson' }}>{msg}</p>}
      <p style={{ marginTop: 12 }}>
        <a href="/reset" style={{ fontSize: 13, color: '#0070f3' }}>비밀번호를 잊으셨나요?</a>
      </p>
    </main>
  );
}
