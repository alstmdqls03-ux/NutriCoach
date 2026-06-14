'use client';
import { useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';

export interface Turn { role: 'user' | 'assistant'; text: string; }

export default function Chat({ initialTurns = [] }: { initialTurns?: Turn[] }) {
  const [turns, setTurns] = useState<Turn[]>(initialTurns);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  // Synchronous re-entrancy guard. `busy` is React state and its closure value
  // is stale across two clicks fired in the same tick (rapid double-click),
  // so both would pass the guard and send twice -> duplicate logs. A ref flips
  // immediately and is read synchronously, so the second click is dropped.
  const sendingRef = useRef(false);

  async function send() {
    const text = input.trim();
    if (!text || sendingRef.current) return;
    sendingRef.current = true;
    setInput('');
    setTurns((t) => [...t, { role: 'user', text }]);
    setBusy(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      if (res.status === 401) { window.location.href = '/login'; return; }
      const json = await res.json().catch(() => ({} as { reply?: string }));
      const reply = typeof json.reply === 'string' && json.reply.trim()
        ? json.reply
        : '오류가 났어요. 다시 시도해주세요.';
      setTurns((t) => [...t, { role: 'assistant', text: reply }]);
    } finally {
      setBusy(false);
      sendingRef.current = false;
    }
  }

  async function logout() {
    try { await supabaseBrowser().auth.signOut(); } finally {
      window.location.href = '/login';
    }
  }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 22px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>코치 채팅</h2>
        <button onClick={logout} style={{
          fontSize: 13, padding: '6px 12px', borderRadius: 999, border: '1px solid var(--hair)',
          background: 'var(--bg-elev)', color: 'var(--text-2)', cursor: 'pointer',
        }}>로그아웃</button>
      </div>
      <div style={{ minHeight: 200, border: '1px solid var(--hair)', background: 'var(--bg-elev)', padding: 14, borderRadius: 'var(--r-card)' }}>
        {turns.length === 0 && (
          <div style={{ color: 'var(--text-2)', lineHeight: 1.6, fontSize: 14 }}>
            <p style={{ margin: '0 0 8px' }}>기록을 돌아보고 코칭해드려요. 기록은 &apos;기록&apos; 탭에서 해주세요.</p>
            <p style={{ margin: 0, color: 'var(--text-3)' }}>
              이렇게 물어보세요:<br />· &quot;이번 주 운동 어땠어?&quot;<br />· &quot;요즘 수면 어때?&quot;<br />· &quot;다음 운동 추천해줘&quot;
            </p>
          </div>
        )}
        <div style={{ display: 'grid', gap: 8 }}>
          {turns.map((t, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: t.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <span style={{
                maxWidth: '82%', padding: '9px 13px', borderRadius: 14, fontSize: 14.5, lineHeight: 1.45,
                background: t.role === 'user' ? 'var(--accent)' : 'var(--bg-elev2)',
                color: t.role === 'user' ? 'var(--accent-ink)' : 'var(--text)',
              }}>{t.text}</span>
            </div>
          ))}
        </div>
        {busy && <p style={{ color: 'var(--text-3)', fontStyle: 'italic', margin: '8px 0 0' }}>코치가 입력 중…</p>}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <input value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()} aria-label="메시지 입력" placeholder="예: 이번 주 운동 어땠어?"
          style={{
            flex: 1, height: 48, borderRadius: 'var(--r-btn)', border: '1px solid var(--hair)',
            background: 'var(--bg-elev)', color: 'var(--text)', padding: '0 14px', fontSize: 15, outline: 'none',
          }} />
        <button onClick={send} disabled={busy} style={{
          height: 48, padding: '0 18px', borderRadius: 'var(--r-btn)', border: 'none', background: 'var(--accent)',
          color: 'var(--accent-ink)', fontSize: 15, fontWeight: 650, cursor: 'pointer', opacity: busy ? 0.6 : 1,
        }}>보내기</button>
      </div>
    </div>
  );
}
