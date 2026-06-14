'use client';
import { useState, type CSSProperties } from 'react';
import Link from 'next/link';
import type { CoachResponse, Experience } from '@/lib/coach/types';

const BODY_PARTS = ['가슴', '등', '어깨', '이두', '삼두', '하체', '둔근', '복근'];
const EXP_LABEL: Record<Experience, string> = { beginner: '초급', intermediate: '중급', advanced: '고급' };

interface Choice { id: string; name: string; }

const field: CSSProperties = {
  width: '100%', height: 48, borderRadius: 'var(--r-btn)', border: '1px solid var(--hair)',
  background: 'var(--bg-elev)', color: 'var(--text)', padding: '0 16px', fontSize: 16, outline: 'none',
};
const primaryBtn: CSSProperties = {
  width: '100%', height: 52, borderRadius: 'var(--r-btn)', border: 'none',
  background: 'var(--accent)', color: 'var(--accent-ink)', fontSize: 16, fontWeight: 650, cursor: 'pointer',
};
const labelStyle: CSSProperties = { fontSize: 13, fontWeight: 600, color: 'var(--text-2)', display: 'grid', gap: 6 };

export function RoutineBuilder({ initialMachines = [], displayName = null, initialExperience = 'beginner' }: {
  initialMachines?: string[]; displayName?: string | null; initialExperience?: Experience;
}) {
  const [targetMuscle, setTargetMuscle] = useState('가슴');
  const [res, setRes] = useState<CoachResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function generate() {
    if (initialMachines.length === 0) { setError('먼저 머신을 골라주세요.'); return; }
    setRes(null); setLoading(true); setError(null);
    try {
      const r = await fetch('/api/coach', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ machines: initialMachines, targetMuscle, experience: initialExperience }),
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
    <section style={{ display: 'grid', gap: 14, padding: '58px 22px 0' }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--text-3)' }}>오늘의 코치</div>
        <h1 style={{ margin: '6px 0 0', fontSize: 27, fontWeight: 750, letterSpacing: -0.6, color: 'var(--text)' }}>
          {displayName ? `${displayName}님, 가보죠 💪` : '루틴 만들기 💪'}
        </h1>
        <span style={{ display: 'inline-block', marginTop: 8, fontSize: 12, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-soft)', borderRadius: 999, padding: '4px 10px' }}>
          경험 · {EXP_LABEL[initialExperience]}
        </span>
      </div>

      {/* machines: chips + picker */}
      <div style={{ display: 'grid', gap: 8 }}>
        <div style={labelStyle}>내 머신</div>
        {initialMachines.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {initialMachines.map((m) => (
              <span key={m} style={{ fontSize: 13, color: 'var(--text)', background: 'var(--bg-elev2)', border: '1px solid var(--hair)', borderRadius: 999, padding: '6px 12px' }}>{m}</span>
            ))}
          </div>
        ) : (
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text-3)' }}>아직 고른 머신이 없어요.</p>
        )}
        <Link href="/coach/machines" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', height: 48, textDecoration: 'none',
          borderRadius: 'var(--r-btn)', border: '1px solid var(--accent)', background: 'transparent',
          color: 'var(--accent)', fontSize: 15, fontWeight: 650,
        }}>{initialMachines.length > 0 ? '머신 수정하기' : '머신 고르기 (사진으로)'}</Link>
      </div>

      <label style={labelStyle}>
        타겟 부위
        <input value={targetMuscle} onChange={(e) => setTargetMuscle(e.target.value)} style={field} />
      </label>
      <button onClick={generate} disabled={loading} style={{ ...primaryBtn, opacity: loading ? 0.6 : 1 }}>
        {loading ? '생성 중…' : '루틴 만들기'}
      </button>

      {error && <p style={{ color: '#ff8a6a', fontSize: 14, margin: 0 }}>{error}</p>}

      {res && (
        <div style={{ display: 'grid', gap: 12 }}>
          {res.misses.map((m) => <AliasForm key={m.input} alias={m.input} onRegistered={generate} />)}
          <h2 style={{ margin: '6px 0 0', fontSize: 19, fontWeight: 700, color: 'var(--text)' }}>{res.routine.targetMuscle} 루틴</h2>
          {res.routine.exercises.length === 0 && <p style={{ color: 'var(--text-2)', margin: 0 }}>해당 부위로 매칭된 머신이 없어요.</p>}
          <div style={{ display: 'grid', gap: 10 }}>
            {res.routine.exercises.map((ex) => {
              const p = res.progression.prescriptions.find((x) => x.exerciseId === ex.exerciseId);
              const load = p?.weight_kg == null ? '기록 없음' : `${p.weight_kg}kg`;
              return (
                <div key={ex.exerciseId} style={{ background: 'var(--bg-elev)', border: '1px solid var(--hair)', borderRadius: 'var(--r-card)', padding: '16px 18px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                    <strong style={{ fontSize: 16.5, fontWeight: 700, color: 'var(--text)' }}>{ex.name}</strong>
                    <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{ex.sets}세트 × {ex.repRange[0]}–{ex.repRange[1]}회</span>
                  </div>
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18, fontWeight: 750, color: 'var(--accent)', letterSpacing: -0.3 }}>{load}</span>
                    <span style={{ fontSize: 13, color: 'var(--text-3)' }}>· 목표 {p?.repTarget}회</span>
                  </div>
                  {p?.note && <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 6, lineHeight: 1.4 }}>{p.note}</div>}
                </div>
              );
            })}
          </div>
          {res.routine.exercises.length > 0 && <ExplainPanel targetMuscle={res.routine.targetMuscle} />}
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
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ alias, exerciseId }),
      });
      if (r.ok) onRegistered();
    } finally { setBusy(false); }
  }
  const sel: CSSProperties = { height: 40, borderRadius: 12, border: '1px solid var(--hair)', background: 'var(--bg-elev2)', color: 'var(--text)', padding: '0 10px', fontSize: 14 };
  return (
    <div style={{ border: '1px solid var(--accent)', background: 'var(--accent-soft)', borderRadius: 'var(--r-card)', padding: 14 }}>
      <div style={{ fontSize: 14, color: 'var(--text)' }}>미매핑: <strong>{alias}</strong> — 별칭 등록</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <select value={muscle} onChange={(e) => loadChoices(e.target.value)} style={sel}>
          <option value="">부위 선택</option>
          {BODY_PARTS.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <select value={exerciseId} onChange={(e) => setExerciseId(e.target.value)} disabled={choices.length === 0} style={sel}>
          <option value="">기구 선택</option>
          {choices.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button onClick={register} disabled={!exerciseId || busy} style={{ height: 40, padding: '0 16px', borderRadius: 12, border: 'none', cursor: 'pointer', background: 'var(--accent)', color: 'var(--accent-ink)', fontSize: 14, fontWeight: 650, opacity: !exerciseId || busy ? 0.5 : 1 }}>{busy ? '등록 중…' : '등록'}</button>
      </div>
    </div>
  );
}

function ExplainPanel({ targetMuscle }: { targetMuscle: string }) {
  const defaultQ = `${targetMuscle} 근비대를 위해 어떻게 훈련해야 하나요? 볼륨, 강도, 실패 근접도 관점에서.`;
  const [question, setQuestion] = useState(defaultQ);
  const [data, setData] = useState<{ explanations: { claim: string; chunk_ids: string[] }[]; citations: { chunk_id: string; label: string; snippet: string }[] } | null>(null);
  const [busy, setBusy] = useState(false);

  async function ask() {
    const q = question.trim();
    if (!q) return;
    setBusy(true); setData(null);
    try {
      const r = await fetch('/api/coach/explain', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: q }) });
      if (r.ok) setData(await r.json());
    } finally { setBusy(false); }
  }
  const citeIndex = (id: string) => (data ? data.citations.findIndex((c) => c.chunk_id === id) + 1 : 0);

  return (
    <div style={{ display: 'grid', gap: 8, marginTop: 4 }}>
      <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-2)', display: 'grid', gap: 6 }}>
        논문에 물어보기 (직접 질문)
        <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={2} placeholder="예: 레그프레스 발 위치는? / 초보자는 주당 며칠?"
          style={{ width: '100%', borderRadius: 'var(--r-btn)', border: '1px solid var(--hair)', background: 'var(--bg-elev)', color: 'var(--text)', padding: '10px 14px', fontSize: 15, outline: 'none', resize: 'vertical' }} />
      </label>
      <button onClick={ask} disabled={busy} style={{ height: 48, borderRadius: 'var(--r-btn)', border: '1px solid var(--accent)', background: 'transparent', color: 'var(--accent)', fontSize: 15, fontWeight: 650, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}>{busy ? '근거 찾는 중…' : '왜? (논문 근거 찾기)'}</button>
      {data && (
        <div style={{ background: 'var(--bg-elev)', border: '1px solid var(--hair)', borderRadius: 'var(--r-card)', padding: 16 }}>
          {data.explanations.length === 0 && <p style={{ color: 'var(--text-3)', margin: 0 }}>근거 있는 설명을 찾지 못했어요.</p>}
          <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 6 }}>
            {data.explanations.map((e, i) => (
              <li key={i} style={{ color: 'var(--text)', fontSize: 15, lineHeight: 1.5 }}>
                {e.claim} {e.chunk_ids.map((id) => <sup key={id} style={{ color: 'var(--accent)' }}>[{citeIndex(id)}]</sup>)}
              </li>
            ))}
          </ul>
          {data.citations.length > 0 && (
            <ol style={{ margin: '12px 0 0', paddingLeft: 18, fontSize: 12, color: 'var(--text-3)', display: 'grid', gap: 4 }}>
              {data.citations.map((c) => <li key={c.chunk_id}>{c.label} — {c.snippet}…</li>)}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
