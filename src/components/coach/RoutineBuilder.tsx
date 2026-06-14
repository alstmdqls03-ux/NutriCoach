'use client';
import { useState } from 'react';
import type { CoachResponse, Experience } from '@/lib/coach/types';

const EXPERIENCES: { value: Experience; label: string }[] = [
  { value: 'beginner', label: '초급' },
  { value: 'intermediate', label: '중급' },
  { value: 'advanced', label: '고급' },
];

// Korean body-part terms offered in the alias picker (keys of the target-muscle map).
const BODY_PARTS = ['가슴', '등', '어깨', '이두', '삼두', '하체', '둔근', '복근'];

interface Choice { id: string; name: string; }

export function RoutineBuilder({ initialMachines = [] }: { initialMachines?: string[] }) {
  const [machines, setMachines] = useState(initialMachines.join(', '));
  const [targetMuscle, setTargetMuscle] = useState('가슴');
  const [experience, setExperience] = useState<Experience>('beginner');
  const [res, setRes] = useState<CoachResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function machineList() {
    return machines.split(',').map((s) => s.trim()).filter(Boolean);
  }

  async function generate(list: string[]) {
    setLoading(true); setError(null);
    try {
      const r = await fetch('/api/coach', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ machines: list, targetMuscle, experience }),
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

  function submit() {
    setRes(null);
    generate(machineList());
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
          {res.misses.map((m) => (
            <AliasForm key={m.input} alias={m.input} onRegistered={() => generate(machineList())} />
          ))}
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

function AliasForm({ alias, onRegistered }: { alias: string; onRegistered: () => void }) {
  const [muscle, setMuscle] = useState('');
  const [choices, setChoices] = useState<Choice[]>([]);
  const [exerciseId, setExerciseId] = useState('');
  const [busy, setBusy] = useState(false);

  async function loadChoices(m: string) {
    setMuscle(m); setExerciseId(''); setChoices([]);
    if (!m) return;
    const r = await fetch(`/api/coach/exercises?muscle=${encodeURIComponent(m)}`);
    if (r.ok) setChoices(await r.json());
  }

  async function register() {
    if (!exerciseId) return;
    setBusy(true);
    try {
      const r = await fetch('/api/coach/aliases', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ alias, exerciseId }),
      });
      if (r.ok) onRegistered();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ color: '#b26a00', border: '1px solid #f0d9b5', padding: 8, borderRadius: 6 }}>
      <div>미매핑: <strong>{alias}</strong> — 별칭 등록</div>
      <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
        <select value={muscle} onChange={(e) => loadChoices(e.target.value)}>
          <option value="">부위 선택</option>
          {BODY_PARTS.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <select value={exerciseId} onChange={(e) => setExerciseId(e.target.value)} disabled={choices.length === 0}>
          <option value="">기구 선택</option>
          {choices.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button onClick={register} disabled={!exerciseId || busy}>{busy ? '등록 중…' : '등록'}</button>
      </div>
    </div>
  );
}
