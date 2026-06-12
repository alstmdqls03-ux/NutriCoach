'use client';
import { useState } from 'react';
import type { WorkoutInput } from '@/lib/log/payload';
import type { ExercisePrefill, WorkoutEntry } from '@/lib/log/history';

export default function WorkoutLog({ exercises, lastSession, onSubmit, busy }: {
  exercises: ExercisePrefill[];
  lastSession: WorkoutEntry[];
  onSubmit: (entries: WorkoutInput[]) => void;
  busy: boolean;
}) {
  const [entries, setEntries] = useState<WorkoutInput[]>([]);
  const [newName, setNewName] = useState('');

  function addEntry(e: WorkoutInput) { setEntries((cur) => [...cur, e]); }
  function update(i: number, patch: Partial<WorkoutInput>) {
    setEntries((cur) => cur.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  }
  function remove(i: number) { setEntries((cur) => cur.filter((_, idx) => idx !== i)); }

  return (
    <section style={{ border: '1px solid #eee', borderRadius: 12, padding: 16, marginBottom: 16 }}>
      <h3 style={{ margin: '0 0 12px' }}>운동</h3>

      {lastSession.length > 0 && (
        <button type="button" onClick={() => setEntries(lastSession.map((e) => ({ ...e })))}
          style={{ ...chip(false), marginBottom: 12, width: '100%' }}>
          ↻ 어제처럼 반복 ({lastSession.map((e) => e.exercise).join(', ')})
        </button>
      )}

      {exercises.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {exercises.map((ex) => (
            <button key={ex.key} type="button"
              onClick={() => addEntry({ exercise: ex.name, weight_kg: ex.weight_kg, reps: ex.reps, sets: ex.sets })}
              style={chip(false)}>+ {ex.name}</button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        <input value={newName} onChange={(e) => setNewName(e.target.value)}
          placeholder="+ 종목 직접 입력" aria-label="새 종목"
          style={{ flex: 1, padding: 8, border: '1px solid #ddd', borderRadius: 8 }} />
        <button type="button"
          onClick={() => {
            if (!newName.trim()) return;
            addEntry({ exercise: newName.trim(), weight_kg: 20, reps: 10, sets: 3 });
            setNewName('');
          }}
          style={chip(false)}>추가</button>
      </div>

      {entries.map((e, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <b style={{ flexBasis: '100%' }}>{e.exercise}</b>
          <Stepper label="kg" value={e.weight_kg} step={2.5} onChange={(v) => update(i, { weight_kg: v })} />
          <Stepper label="회" value={e.reps} step={1} onChange={(v) => update(i, { reps: v })} />
          <Stepper label="세트" value={e.sets} step={1} onChange={(v) => update(i, { sets: v })} />
          <button type="button" onClick={() => remove(i)} style={{ ...chip(false), color: '#c00' }}>삭제</button>
        </div>
      ))}

      <button type="button" disabled={busy || entries.length === 0}
        onClick={() => onSubmit(entries)}
        style={primaryBtn(busy || entries.length === 0)}>
        운동 기록 ({entries.length})
      </button>
    </section>
  );
}

function Stepper({ label, value, step, onChange }: {
  label: string; value: number; step: number; onChange: (v: number) => void;
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <button type="button" onClick={() => onChange(Math.max(0, +(value - step).toFixed(2)))} style={stepBtn}>−</button>
      <span style={{ minWidth: 48, textAlign: 'center' }}>{value}{label}</span>
      <button type="button" onClick={() => onChange(+(value + step).toFixed(2))} style={stepBtn}>+</button>
    </span>
  );
}

const stepBtn: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 8, border: '1px solid #ddd', background: '#fff',
  fontSize: 18, cursor: 'pointer', lineHeight: 1,
};
function chip(active: boolean): React.CSSProperties {
  return {
    padding: '8px 12px', borderRadius: 999, cursor: 'pointer', fontSize: 14,
    border: active ? '1px solid #0070f3' : '1px solid #ddd',
    background: active ? '#e8f1ff' : '#fff', color: active ? '#0070f3' : '#333',
  };
}
function primaryBtn(disabled: boolean): React.CSSProperties {
  return {
    width: '100%', padding: 12, borderRadius: 8, border: 'none', fontSize: 15, marginTop: 4,
    background: disabled ? '#9bbcf0' : '#0070f3', color: '#fff', cursor: disabled ? 'default' : 'pointer',
  };
}
