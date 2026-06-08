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
    <div style={{ maxWidth: 600, margin: '40px auto', fontFamily: 'system-ui' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>NutriCoach</h2>
        <button onClick={logout} style={{ fontSize: 13, padding: '4px 10px' }}>로그아웃</button>
      </div>
      <div style={{ minHeight: 300, border: '1px solid #ddd', padding: 12, borderRadius: 8, marginTop: 12 }}>
        {turns.length === 0 && (
          <div style={{ color: '#666', lineHeight: 1.6 }}>
            <p style={{ margin: '0 0 8px' }}>안녕하세요! 저는 운동·수면을 기록하고 돌아봐 드리는 건강 코치예요.</p>
            <p style={{ margin: 0 }}>
              이렇게 말해보세요:<br />
              · &quot;오늘 스쿼트 80kg 5회 5세트 했어&quot;<br />
              · &quot;어제 7시간 잤어&quot;<br />
              · &quot;이번 주 운동 어땠어?&quot;
            </p>
          </div>
        )}
        {turns.map((t, i) => (
          <p key={i} style={{ textAlign: t.role === 'user' ? 'right' : 'left' }}>
            <b>{t.role === 'user' ? '나' : '코치'}:</b> {t.text}
          </p>
        ))}
        {busy && <p><i>코치가 입력 중…</i></p>}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          aria-label="메시지 입력"
          placeholder="예: 벤치 60kg 8회 3세트 했어"
          style={{ flex: 1, padding: 8 }} />
        <button onClick={send} disabled={busy}>보내기</button>
      </div>
    </div>
  );
}
