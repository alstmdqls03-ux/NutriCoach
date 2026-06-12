'use client';
import { useState } from 'react';
import { SLEEP_TAGS, type SleepInput } from '@/lib/log/payload';

const DURATIONS = [5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9];
const QUALITIES: SleepInput['quality'][] = ['좋음', '보통', '나쁨'];

export default function SleepLog({ onSubmit, busy }: {
  onSubmit: (input: SleepInput) => void;
  busy: boolean;
}) {
  const [hours, setHours] = useState(7);
  const [quality, setQuality] = useState<SleepInput['quality']>('보통');
  const [tags, setTags] = useState<Set<string>>(new Set());

  function toggleTag(t: string) {
    setTags((cur) => {
      const next = new Set(cur);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  }

  return (
    <section style={{ border: '1px solid #eee', borderRadius: 12, padding: 16, marginBottom: 16 }}>
      <h3 style={{ margin: '0 0 12px' }}>수면</h3>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {DURATIONS.map((h) => (
          <button key={h} onClick={() => setHours(h)} type="button"
            style={chip(h === hours)}>{h}시간</button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {QUALITIES.map((q) => (
          <button key={q} onClick={() => setQuality(q)} type="button"
            style={chip(q === quality)}>{q}</button>
        ))}
      </div>

      <p style={{ margin: '0 0 6px', fontSize: 13, color: '#666' }}>수면에 영향 (선택)</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        {SLEEP_TAGS.map((t) => (
          <button key={t} onClick={() => toggleTag(t)} type="button"
            style={chip(tags.has(t))}>{t}</button>
        ))}
      </div>

      <button type="button" disabled={busy}
        onClick={() => onSubmit({
          durationHours: hours, quality,
          ...(tags.size > 0 ? { tags: Array.from(tags) } : {}),
        })}
        style={primaryBtn(busy)}>
        수면 기록
      </button>
    </section>
  );
}

function chip(active: boolean): React.CSSProperties {
  return {
    padding: '8px 12px', borderRadius: 999, cursor: 'pointer', fontSize: 14,
    border: active ? '1px solid #0070f3' : '1px solid #ddd',
    background: active ? '#e8f1ff' : '#fff', color: active ? '#0070f3' : '#333',
  };
}
function primaryBtn(busy: boolean): React.CSSProperties {
  return {
    width: '100%', padding: 12, borderRadius: 8, border: 'none', fontSize: 15,
    background: busy ? '#9bbcf0' : '#0070f3', color: '#fff', cursor: busy ? 'default' : 'pointer',
  };
}
