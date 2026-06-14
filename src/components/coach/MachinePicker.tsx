'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { catalogByBodyPart, machineImageUrl } from '@/lib/coach/catalog';

export function MachinePicker({ initialSelected = [] }: { initialSelected?: string[] }) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set(initialSelected));
  const [busy, setBusy] = useState(false);
  const groups = catalogByBodyPart();

  const toggle = (label: string) => setSel((s) => {
    const n = new Set(s);
    if (n.has(label)) n.delete(label); else n.add(label);
    return n;
  });

  async function save() {
    setBusy(true);
    try {
      await fetch('/api/coach/machines', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ machines: Array.from(sel) }),
      });
      router.push('/coach');
      router.refresh();
    } finally { setBusy(false); }
  }

  return (
    <div style={{ paddingBottom: 96 }}>
      <div style={{ padding: '58px 22px 8px' }}>
        <button onClick={() => router.push('/coach')} aria-label="Back" style={{
          width: 38, height: 38, borderRadius: 999, border: '1px solid var(--hair)', background: 'var(--bg-elev)',
          color: 'var(--text)', cursor: 'pointer', fontSize: 18,
        }}>←</button>
        <h1 style={{ margin: '14px 0 2px', fontSize: 27, fontWeight: 750, letterSpacing: -0.6, color: 'var(--text)' }}>내 머신 고르기</h1>
        <p style={{ margin: 0, fontSize: 15, color: 'var(--text-2)' }}>헬스장에 있는 기구를 골라주세요. {sel.size}개 선택됨.</p>
      </div>

      {groups.map((g) => (
        <div key={g.bodyPart} style={{ padding: '0 22px', marginTop: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 10 }}>{g.bodyPart}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {g.machines.map((m) => {
              const on = sel.has(m.label);
              return (
                <button key={m.label} onClick={() => toggle(m.label)} style={{
                  position: 'relative', textAlign: 'left', cursor: 'pointer', padding: 0, overflow: 'hidden',
                  borderRadius: 'var(--r-card)', border: on ? '2px solid var(--accent)' : '1px solid var(--hair)',
                  background: 'var(--bg-elev)',
                }}>
                  <div style={{ width: '100%', aspectRatio: '4 / 3', background: '#fff', overflow: 'hidden' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={machineImageUrl(m.id)} alt={m.label} loading="lazy"
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </div>
                  <div style={{ padding: '10px 12px', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{m.label}</div>
                  <div style={{
                    position: 'absolute', top: 10, right: 10, width: 24, height: 24, borderRadius: 999,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: on ? 'var(--accent)' : 'rgba(0,0,0,0.45)', color: on ? 'var(--accent-ink)' : '#fff',
                    fontSize: 14, fontWeight: 700,
                  }}>{on ? '✓' : ''}</div>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, padding: '12px 22px 26px', background: 'color-mix(in srgb, var(--bg) 90%, transparent)', backdropFilter: 'blur(12px)', maxWidth: 600, margin: '0 auto' }}>
        <button onClick={save} disabled={busy} style={{
          width: '100%', height: 54, borderRadius: 'var(--r-btn)', border: 'none', background: 'var(--accent)',
          color: 'var(--accent-ink)', fontSize: 16, fontWeight: 650, cursor: 'pointer', opacity: busy ? 0.6 : 1,
        }}>{busy ? '저장 중…' : `${sel.size}개 저장하고 돌아가기`}</button>
      </div>
    </div>
  );
}
