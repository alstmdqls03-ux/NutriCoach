'use client';
import { useState } from 'react';

interface Turn { role: 'user' | 'assistant'; text: string; }

export default function Chat() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setTurns((t) => [...t, { role: 'user', text }]);
    setBusy(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      const json = await res.json();
      setTurns((t) => [...t, { role: 'assistant', text: json.reply ?? '오류가 났어요.' }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 600, margin: '40px auto', fontFamily: 'system-ui' }}>
      <h2>NutriCoach</h2>
      <div style={{ minHeight: 300, border: '1px solid #ddd', padding: 12, borderRadius: 8 }}>
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
          placeholder="예: 벤치 60kg 8회 3세트 했어"
          style={{ flex: 1, padding: 8 }} />
        <button onClick={send} disabled={busy}>보내기</button>
      </div>
    </div>
  );
}
