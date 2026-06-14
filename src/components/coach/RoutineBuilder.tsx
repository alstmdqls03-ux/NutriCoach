'use client';
import { useState } from 'react';
import type { CoachResponse, Experience } from '@/lib/coach/types';

const EXPERIENCES: { value: Experience; label: string }[] = [
  { value: 'beginner', label: '초급' },
  { value: 'intermediate', label: '중급' },
  { value: 'advanced', label: '고급' },
];

export function RoutineBuilder() {
  const [machines, setMachines] = useState('');
  const [targetMuscle, setTargetMuscle] = useState('가슴');
  const [experience, setExperience] = useState<Experience>('beginner');
  const [res, setRes] = useState<CoachResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true); setError(null); setRes(null);
    try {
      const r = await fetch('/api/coach', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          machines: machines.split(',').map((s) => s.trim()).filter(Boolean),
          targetMuscle, experience,
        }),
      });
      const body = await r.json();
      if (!r.ok) { setError(body.error ?? '문제가 생겼어요.'); return; }
      setRes(body as CoachResponse);
    } catch {
      setError('네트워크 오류가 발생했어요.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section style={{ display: 'grid', gap: 12, maxWidth: 560 }}>
      <h2>루틴 생성</h2>
      <label>
        내 머신 (쉼표로 구분)
        <input value={machines} onChange={(e) => setMachines(e.target.value)}
          placeholder="펙덱, 랫풀다운, 레그프레스" style={{ width: '100%' }} />
      </label>
      <label>
        타겟 부위
        <input value={targetMuscle} onChange={(e) => setTargetMuscle(e.target.value)} />
      </label>
      <label>
        경험
        <select value={experience} onChange={(e) => setExperience(e.target.value as Experience)}>
          {EXPERIENCES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
        </select>
      </label>
      <button onClick={submit} disabled={loading}>{loading ? '생성 중…' : '루틴 만들기'}</button>

      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      {res && (
        <div style={{ display: 'grid', gap: 8 }}>
          {res.misses.length > 0 && (
            <p style={{ color: '#b26a00' }}>
              미매핑: {res.misses.map((m) => m.input).join(', ')} — 별칭 등록이 필요해요.
            </p>
          )}
          <h3>{res.routine.targetMuscle} 루틴</h3>
          {res.routine.exercises.length === 0 && <p>해당 부위로 매칭된 머신이 없어요.</p>}
          <ul>
            {res.routine.exercises.map((ex) => {
              const p = res.progression.prescriptions.find((x) => x.exerciseId === ex.exerciseId);
              const load = p?.weight_kg == null ? '기록 없음' : `${p.weight_kg}kg`;
              return (
                <li key={ex.exerciseId}>
                  <strong>{ex.name}</strong> — {ex.sets}세트 × {ex.repRange[0]}–{ex.repRange[1]}회
                  <br />
                  <span>다음 세션: {load} · 목표 {p?.repTarget}회</span>
                  {p?.note && <div style={{ fontSize: 13, color: '#555' }}>{p.note}</div>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
