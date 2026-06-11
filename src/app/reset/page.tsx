'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { validateEmail, validateNewPassword, validateCode } from '@/lib/auth/resetValidation';

export default function ResetPage() {
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  // Synchronous re-entrancy guard (same pattern as Chat.tsx) so a double-tap
  // can't fire two requests before React re-renders.
  const sendingRef = useRef(false);

  async function requestCode() {
    if (sendingRef.current) return;
    const err = validateEmail(email);
    if (err) { setMsg(err); return; }
    sendingRef.current = true; setBusy(true); setMsg('');
    try {
      // Same response whether or not the email exists -> no user enumeration.
      await supabaseBrowser().auth.resetPasswordForEmail(email.trim());
      setStep('code');
      setMsg('코드를 메일로 보냈어요. 메일함을 확인해주세요.');
    } catch {
      setMsg('잠시 문제가 생겼어요. 다시 시도해주세요.');
    } finally { setBusy(false); sendingRef.current = false; }
  }

  async function confirmReset() {
    if (sendingRef.current) return;
    const e1 = validateCode(code);
    if (e1) { setMsg(e1); return; }
    const e2 = validateNewPassword(password);
    if (e2) { setMsg(e2); return; }
    sendingRef.current = true; setBusy(true); setMsg('');
    try {
      const sb = supabaseBrowser();
      const { error: vErr } = await sb.auth.verifyOtp({
        email: email.trim(), token: code.trim(), type: 'recovery',
      });
      if (vErr) { setMsg('코드가 올바르지 않거나 만료됐어요.'); return; }
      const { error: uErr } = await sb.auth.updateUser({ password });
      if (uErr) { setMsg('비밀번호 변경에 실패했어요. 다시 시도해주세요.'); return; }
      router.refresh();
      router.push('/');
    } catch {
      setMsg('잠시 문제가 생겼어요. 다시 시도해주세요.');
    } finally { setBusy(false); sendingRef.current = false; }
  }

  return (
    <main style={{ maxWidth: 360, margin: '80px auto', fontFamily: 'system-ui' }}>
      <h1>비밀번호 재설정</h1>
      {step === 'email' && (
        <>
          <input
            placeholder="email" type="email" value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && requestCode()}
            aria-label="이메일"
            style={{ display: 'block', width: '100%', margin: '8px 0', padding: 8 }}
          />
          <button onClick={requestCode} disabled={busy}>코드 받기</button>
        </>
      )}
      {step === 'code' && (
        <>
          <input
            placeholder="메일로 받은 6자리 코드" inputMode="numeric" value={code}
            onChange={(e) => setCode(e.target.value)}
            aria-label="인증 코드"
            style={{ display: 'block', width: '100%', margin: '8px 0', padding: 8 }}
          />
          <input
            placeholder="새 비밀번호 (8자 이상)" type="password" value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && confirmReset()}
            aria-label="새 비밀번호"
            style={{ display: 'block', width: '100%', margin: '8px 0', padding: 8 }}
          />
          <button onClick={confirmReset} disabled={busy} style={{ marginRight: 8 }}>비밀번호 변경</button>
          <button onClick={() => { setStep('email'); setMsg(''); setCode(''); setPassword(''); }} disabled={busy}>
            이메일 다시 입력
          </button>
        </>
      )}
      {msg && <p style={{ color: msg.startsWith('코드를 메일로') ? 'green' : 'crimson' }}>{msg}</p>}
      <p style={{ marginTop: 16 }}>
        <a href="/login" style={{ fontSize: 13, color: '#0070f3' }}>로그인으로 돌아가기</a>
      </p>
    </main>
  );
}
