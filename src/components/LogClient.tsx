'use client';
import { useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import SleepLog from './SleepLog';
import WorkoutLog from './WorkoutLog';
import type { WorkoutInput, SleepInput } from '@/lib/log/payload';
import type { ExercisePrefill, WorkoutEntry } from '@/lib/log/history';

function todayLocal(): string {
  // YYYY-MM-DD in the browser's local zone, for the date <input>.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function LogClient({ exercises, lastSession }: {
  exercises: ExercisePrefill[];
  lastSession: WorkoutEntry[];
}) {
  const [date, setDate] = useState(todayLocal());
  const [busy, setBusy] = useState(false);
  const [insight, setInsight] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const sendingRef = useRef(false);

  // loggedAt: noon on the chosen local day → stable across timezones, never
  // crosses a day boundary when converted to UTC for Asia/Seoul.
  function loggedAtForDate(): string {
    return new Date(`${date}T12:00:00`).toISOString();
  }

  async function post(type: 'workout' | 'sleep', data: WorkoutInput | SleepInput): Promise<string | null> {
    const res = await fetch('/api/log', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, data, loggedAt: loggedAtForDate() }),
    });
    if (res.status === 401) { window.location.href = '/login'; return null; }
    const json = await res.json().catch(() => ({} as { insight?: string; error?: string }));
    if (!res.ok) { setError(json.error ?? '저장에 실패했어요.'); return null; }
    return json.insight ?? null;
  }

  async function submitWorkout(entries: WorkoutInput[]) {
    if (sendingRef.current) return;
    sendingRef.current = true; setBusy(true); setError(null);
    try {
      let last: string | null = null;
      for (const e of entries) last = await post('workout', e);
      if (last !== null) { setInsight(last); setCanUndo(true); }
    } finally { setBusy(false); sendingRef.current = false; }
  }

  async function submitSleep(input: SleepInput) {
    if (sendingRef.current) return;
    sendingRef.current = true; setBusy(true); setError(null);
    try {
      const line = await post('sleep', input);
      if (line !== null) { setInsight(line); setCanUndo(true); }
    } finally { setBusy(false); sendingRef.current = false; }
  }

  async function undoLast() {
    if (sendingRef.current) return;
    sendingRef.current = true; setBusy(true);
    try {
      const res = await fetch('/api/log', { method: 'DELETE' });
      if (res.ok) { setInsight('마지막 기록을 취소했어요.'); setCanUndo(false); }
    } finally { setBusy(false); sendingRef.current = false; }
  }

  async function logout() {
    try { await supabaseBrowser().auth.signOut(); } finally { window.location.href = '/login'; }
  }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', fontFamily: 'system-ui', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>기록</h2>
        <button onClick={logout} style={{ fontSize: 13, padding: '4px 10px' }}>로그아웃</button>
      </div>

      <label style={{ display: 'block', fontSize: 13, color: '#666', marginBottom: 16 }}>
        날짜&nbsp;
        <input type="date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)}
          style={{ padding: 6, border: '1px solid #ddd', borderRadius: 6 }} />
      </label>

      {insight && (
        <div style={{ background: '#f0f7ff', border: '1px solid #cfe3ff', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
          <span>{insight}</span>
          {canUndo && (
            <button onClick={undoLast} disabled={busy}
              style={{ marginLeft: 10, fontSize: 13, color: '#0070f3', background: 'none', border: 'none', cursor: 'pointer' }}>
              방금 기록 취소
            </button>
          )}
        </div>
      )}
      {error && <p style={{ color: '#c00', marginTop: 0 }}>{error}</p>}

      <WorkoutLog exercises={exercises} lastSession={lastSession} onSubmit={submitWorkout} busy={busy} />
      <SleepLog onSubmit={submitSleep} busy={busy} />
    </div>
  );
}
