'use client';
import { useRef, useState, type ReactNode } from 'react';
import {
  IconBack, IconCheck, IconArrow, IconMail, IconFlame, IconDumbbell, IconHeart,
  IconWind, IconLeaf, IconBowl, IconBell, IconApple, IconGoogle, IconBloomMark,
} from './icons';

export interface OnboardData {
  name?: string;
  goals?: string[];
  units?: 'Metric' | 'Imperial';
  heightCm?: string; weightKg?: string; heightIn?: string; weightLb?: string;
  age?: string;
  experience?: 'beginner' | 'intermediate' | 'advanced';
  activity?: string;
}

const EXP_TO_KO: Record<string, string> = { beginner: '초급', intermediate: '중급', advanced: '고급' };
const KO_TO_EXP: Record<string, 'beginner' | 'intermediate' | 'advanced'> = { '초급': 'beginner', '중급': 'intermediate', '고급': 'advanced' };
type Patch = Partial<OnboardData> | ((d: OnboardData) => Partial<OnboardData>);
type Set = (p: Patch) => void;
interface Progress { n: number; i: number }

/* ───────── primitives ───────── */

function ScreenShell({ onBack, progress, children, footer, scroll = true }: {
  onBack?: () => void; progress?: Progress; children: ReactNode; footer?: ReactNode; scroll?: boolean;
}) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      {(onBack || progress) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '58px 22px 6px', flexShrink: 0 }}>
          {onBack ? (
            <button onClick={onBack} aria-label="Back" style={{
              width: 38, height: 38, borderRadius: 999, flexShrink: 0, border: '1px solid var(--hair)',
              background: 'var(--bg-elev)', color: 'var(--text)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', cursor: 'pointer', padding: 0,
            }}><IconBack size={20} /></button>
          ) : <div style={{ width: 38 }} />}
          {progress && (
            <div style={{ flex: 1, display: 'flex', gap: 6, alignItems: 'center' }}>
              {Array.from({ length: progress.n }).map((_, i) => (
                <div key={i} style={{
                  flex: 1, height: 4, borderRadius: 999,
                  background: i < progress.i ? 'var(--accent)' : 'var(--track)', transition: 'background .35s ease',
                }} />
              ))}
            </div>
          )}
        </div>
      )}
      <div style={{ flex: 1, overflowY: scroll ? 'auto' : 'hidden', overflowX: 'hidden', padding: '14px 26px 0' }}>{children}</div>
      {footer && <div style={{ padding: '14px 26px 30px', flexShrink: 0 }}>{footer}</div>}
    </div>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: 1.4, textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 14 }}>{children}</div>;
}
function Title({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div style={{ marginBottom: 26 }}>
      <h1 style={{ margin: 0, fontSize: 30, lineHeight: 1.12, fontWeight: 700, letterSpacing: -0.5, color: 'var(--text)' }}>{children}</h1>
      {sub && <p style={{ margin: '12px 0 0', fontSize: 16, lineHeight: 1.45, fontWeight: 400, color: 'var(--text-2)' }}>{sub}</p>}
    </div>
  );
}
function PrimaryButton({ children, onClick, disabled, icon }: { children: ReactNode; onClick?: () => void; disabled?: boolean; icon?: ReactNode }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width: '100%', height: 56, borderRadius: 'var(--r-btn)', border: 'none',
      background: disabled ? 'var(--bg-elev2)' : 'var(--accent)', color: disabled ? 'var(--text-3)' : 'var(--accent-ink)',
      fontSize: 17, fontWeight: 650, fontFamily: 'inherit', letterSpacing: -0.2, cursor: disabled ? 'default' : 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, transition: 'background .2s, color .2s',
    }}>{children}{icon}</button>
  );
}
function GhostButton({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button onClick={onClick} style={{
      width: '100%', height: 52, borderRadius: 'var(--r-btn)', border: 'none', background: 'transparent',
      color: 'var(--text-2)', fontSize: 16, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
    }}>{children}</button>
  );
}

/* ───────── 0 · Welcome ───────── */
export function WelcomeScreen({ next, signIn }: { next: () => void; signIn: () => void }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)', padding: '0 26px 30px' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingTop: 40 }}>
        <div style={{ position: 'relative', width: 132, height: 132, marginBottom: 40 }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: 44, background: 'var(--accent)', opacity: 0.12 }} />
          <div style={{ position: 'absolute', inset: 18, borderRadius: 34, border: '1.5px solid var(--accent)', opacity: 0.45 }} />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
            <IconBloomMark size={56} />
          </div>
        </div>
        <h1 style={{ margin: 0, fontSize: 44, fontWeight: 750, letterSpacing: -1.2, color: 'var(--text)' }}>Bloom</h1>
        <p style={{ margin: '14px 0 0', fontSize: 18, lineHeight: 1.45, color: 'var(--text-2)', maxWidth: 290 }}>
          Small steps, every day. A gentler way to stay active and feel good.
        </p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <PrimaryButton onClick={next} icon={<IconArrow size={20} />}>Get started</PrimaryButton>
        <GhostButton onClick={signIn}>I already have an account</GhostButton>
      </div>
    </div>
  );
}

/* ───────── 1 · Auth (email signup) ───────── */
function AuthRow({ icon, label, onClick, filled, disabled }: { icon: ReactNode; label: string; onClick?: () => void; filled?: boolean; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width: '100%', height: 56, borderRadius: 'var(--r-btn)', border: filled ? 'none' : '1px solid var(--hair)',
      background: filled ? 'var(--text)' : 'var(--bg-elev)', color: filled ? 'var(--bg)' : 'var(--text)',
      fontSize: 16.5, fontWeight: 600, fontFamily: 'inherit', cursor: disabled ? 'default' : 'pointer',
      opacity: disabled ? 0.5 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 11, position: 'relative',
    }}><span style={{ display: 'flex' }}>{icon}</span>{label}</button>
  );
}
export function AuthScreen({ next, back, signUp }: {
  next: () => void; back: () => void; signUp: (email: string, password: string) => Promise<string | null>;
}) {
  const [showEmail, setShowEmail] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputStyle = {
    width: '100%', height: 52, borderRadius: 'var(--r-btn)', border: '1px solid var(--hair)',
    background: 'var(--bg-elev)', color: 'var(--text)', padding: '0 16px', fontSize: 16, fontFamily: 'inherit', outline: 'none',
  } as const;

  async function create() {
    if (!email.trim() || password.length < 6) { setErr('이메일과 6자 이상 비밀번호를 입력하세요.'); return; }
    setBusy(true); setErr(null);
    const e = await signUp(email.trim(), password);
    setBusy(false);
    if (e) setErr(e); else next();
  }

  return (
    <ScreenShell onBack={back}>
      <div style={{ paddingTop: 8 }}>
        <Eyebrow>Create your account</Eyebrow>
        <Title sub="One tap to start. We'll never post anything or share your data.">Welcome to Bloom</Title>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 6 }}>
          <AuthRow filled icon={<IconApple size={20} />} label="Continue with Apple (준비 중)" disabled />
          <AuthRow icon={<IconGoogle size={19} />} label="Continue with Google (준비 중)" disabled />
          <AuthRow icon={<IconMail size={20} />} label="Continue with email" onClick={() => setShowEmail(true)} />
        </div>
        {showEmail && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
            <input type="email" placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} autoFocus />
            <input type="password" placeholder="password (6자 이상)" value={password} onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') create(); }} style={inputStyle} />
            {err && <p style={{ margin: 0, color: '#ff8a6a', fontSize: 13 }}>{err}</p>}
            <PrimaryButton onClick={create} disabled={busy} icon={<IconArrow size={20} />}>{busy ? '계정 생성 중…' : 'Create account'}</PrimaryButton>
          </div>
        )}
        <p style={{ margin: '26px 4px 0', fontSize: 13, lineHeight: 1.5, color: 'var(--text-3)', textAlign: 'center' }}>
          By continuing you agree to our{' '}
          <span style={{ color: 'var(--text-2)', textDecoration: 'underline' }}>Terms</span> and{' '}
          <span style={{ color: 'var(--text-2)', textDecoration: 'underline' }}>Privacy Policy</span>.
        </p>
      </div>
    </ScreenShell>
  );
}

/* ───────── 2 · Name ───────── */
export function NameScreen({ data, set, next, back, progress }: { data: OnboardData; set: Set; next: () => void; back: () => void; progress: Progress }) {
  const v = data.name || '';
  const ref = useRef<HTMLInputElement>(null);
  return (
    <ScreenShell onBack={back} progress={progress}
      footer={<PrimaryButton disabled={!v.trim()} onClick={next} icon={<IconArrow size={20} />}>Continue</PrimaryButton>}>
      <div style={{ paddingTop: 18 }}>
        <Title sub="We'll use this to keep things personal — nothing fancy.">What should we call you?</Title>
        <input ref={ref} value={v} autoFocus placeholder="First name"
          onChange={(e) => set({ name: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter' && v.trim()) next(); }}
          style={{
            width: '100%', background: 'transparent', border: 'none', borderBottom: '2px solid var(--hair)',
            outline: 'none', padding: '6px 2px 12px', fontSize: 30, fontWeight: 600, color: 'var(--text)',
            fontFamily: 'inherit', letterSpacing: -0.5, caretColor: 'var(--accent)',
          }}
          onFocus={(e) => (e.target.style.borderBottomColor = 'var(--accent)')}
          onBlur={(e) => (e.target.style.borderBottomColor = v.trim() ? 'var(--accent)' : 'var(--hair)')} />
      </div>
    </ScreenShell>
  );
}

/* ───────── 3 · Goals ───────── */
const GOALS = [
  { id: 'lose', label: 'Lose weight', Icon: IconFlame },
  { id: 'muscle', label: 'Build muscle', Icon: IconDumbbell },
  { id: 'active', label: 'Stay active', Icon: IconHeart },
  { id: 'endurance', label: 'Boost endurance', Icon: IconWind },
  { id: 'stress', label: 'Reduce stress', Icon: IconLeaf },
  { id: 'eat', label: 'Eat better', Icon: IconBowl },
];
export function GoalsScreen({ data, set, next, back, progress }: { data: OnboardData; set: Set; next: () => void; back: () => void; progress: Progress }) {
  const sel = data.goals || [];
  const toggle = (id: string) => set((d) => {
    const g = d.goals || [];
    return { goals: g.includes(id) ? g.filter((x) => x !== id) : [...g, id] };
  });
  return (
    <ScreenShell onBack={back} progress={progress}
      footer={<PrimaryButton disabled={sel.length === 0} onClick={next} icon={<IconArrow size={20} />}>
        {sel.length ? `Continue · ${sel.length} selected` : 'Continue'}</PrimaryButton>}>
      <div style={{ paddingTop: 10 }}>
        <Title sub="Pick all that apply. You can change these anytime.">What brings you to Bloom?</Title>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {GOALS.map((g) => {
            const on = sel.includes(g.id);
            return (
              <button key={g.id} onClick={() => toggle(g.id)} style={{
                position: 'relative', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', borderRadius: 'var(--r-card)',
                padding: '18px 16px', border: on ? '1.5px solid var(--accent)' : '1px solid var(--hair)',
                background: on ? 'var(--accent-soft)' : 'var(--bg-elev)', display: 'flex', flexDirection: 'column', gap: 14, minHeight: 112,
                transition: 'background .18s, border-color .18s',
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: on ? 'var(--accent)' : 'var(--bg-elev2)', color: on ? 'var(--accent-ink)' : 'var(--text)',
                }}><g.Icon size={24} /></div>
                <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', letterSpacing: -0.2 }}>{g.label}</div>
                <div style={{
                  position: 'absolute', top: 14, right: 14, width: 22, height: 22, borderRadius: 999, display: 'flex',
                  alignItems: 'center', justifyContent: 'center', border: on ? 'none' : '1.5px solid var(--hair)',
                  background: on ? 'var(--accent)' : 'transparent', color: 'var(--accent-ink)', opacity: on ? 1 : 0.5,
                }}>{on && <IconCheck size={15} />}</div>
              </button>
            );
          })}
        </div>
      </div>
    </ScreenShell>
  );
}

/* ───────── 4 · Metrics ───────── */
function Seg({ options, value, onChange }: { options: string[]; value: string; onChange: (o: string) => void }) {
  return (
    <div style={{ display: 'inline-flex', background: 'var(--bg-elev2)', borderRadius: 999, padding: 3, gap: 2 }}>
      {options.map((o) => (
        <button key={o} onClick={() => onChange(o)} style={{
          padding: '7px 16px', borderRadius: 999, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, fontWeight: 600,
          background: value === o ? 'var(--accent)' : 'transparent', color: value === o ? 'var(--accent-ink)' : 'var(--text-2)',
        }}>{o}</button>
      ))}
    </div>
  );
}
function MetricField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{
      background: 'var(--bg-elev)', border: '1px solid var(--hair)', borderRadius: 'var(--r-card)', padding: '16px 18px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-2)' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>{children}</div>
    </div>
  );
}
function NumInput({ value, onChange, width = 64 }: { value: string; onChange: (v: string) => void; width?: number }) {
  return (
    <input value={value} inputMode="numeric" onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ''))} style={{
      width, textAlign: 'right', background: 'transparent', border: 'none', outline: 'none', fontFamily: 'inherit',
      fontSize: 24, fontWeight: 700, color: 'var(--text)', letterSpacing: -0.5, caretColor: 'var(--accent)',
    }} />
  );
}
function Stepper({ value, onChange, min, max }: { value: number; onChange: (v: number) => void; min: number; max: number }) {
  const btn = (label: string, fn: () => void, disabled: boolean) => (
    <button onClick={fn} disabled={disabled} style={{
      width: 34, height: 34, borderRadius: 999, border: '1px solid var(--hair)', background: 'var(--bg-elev2)',
      color: disabled ? 'var(--text-3)' : 'var(--text)', fontSize: 20, fontWeight: 500, cursor: disabled ? 'default' : 'pointer',
      fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, paddingBottom: 2,
    }}>{label}</button>
  );
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      {btn('−', () => onChange(Math.max(min, value - 1)), value <= min)}
      <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', minWidth: 34, textAlign: 'center' }}>{value}</span>
      {btn('+', () => onChange(Math.min(max, value + 1)), value >= max)}
    </div>
  );
}
export function MetricsScreen({ data, set, next, back, progress }: { data: OnboardData; set: Set; next: () => void; back: () => void; progress: Progress }) {
  const units = data.units || 'Metric';
  const metric = units === 'Metric';
  return (
    <ScreenShell onBack={back} progress={progress}
      footer={<PrimaryButton onClick={next} icon={<IconArrow size={20} />}>Continue</PrimaryButton>}>
      <div style={{ paddingTop: 10 }}>
        <Title sub="This helps us shape a plan that fits you. Estimates are fine.">A few details about you</Title>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
          <Seg options={['Metric', 'Imperial']} value={units} onChange={(u) => set({ units: u as 'Metric' | 'Imperial' })} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <MetricField label="Height">
            <NumInput value={metric ? (data.heightCm || '172') : (data.heightIn || '68')} onChange={(v) => set(metric ? { heightCm: v } : { heightIn: v })} />
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-3)', width: 26 }}>{metric ? 'cm' : 'in'}</span>
          </MetricField>
          <MetricField label="Weight">
            <NumInput value={metric ? (data.weightKg || '68') : (data.weightLb || '150')} onChange={(v) => set(metric ? { weightKg: v } : { weightLb: v })} />
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-3)', width: 26 }}>{metric ? 'kg' : 'lb'}</span>
          </MetricField>
          <MetricField label="Age">
            <Stepper value={parseInt(data.age || '28', 10)} min={13} max={99} onChange={(a) => set({ age: String(a) })} />
          </MetricField>
        </div>
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)', marginBottom: 10 }}>웨이트 트레이닝 경험</div>
          <Seg options={['초급', '중급', '고급']}
            value={EXP_TO_KO[data.experience || 'beginner']}
            onChange={(ko) => set({ experience: KO_TO_EXP[ko] })} />
        </div>
      </div>
    </ScreenShell>
  );
}

/* ───────── 5 · Activity ───────── */
const LEVELS = [
  { id: 'start', label: 'Just starting out', desc: 'Little to no exercise right now', bars: 1 },
  { id: 'light', label: 'Lightly active', desc: 'A walk or workout once or twice a week', bars: 2 },
  { id: 'moderate', label: 'Moderately active', desc: 'Moving most days of the week', bars: 3 },
  { id: 'very', label: 'Very active', desc: 'Training hard nearly every day', bars: 4 },
];
function Bars({ n, active }: { n: number; active: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 20 }}>
      {[1, 2, 3, 4].map((i) => (
        <div key={i} style={{
          width: 4, height: 5 + i * 4, borderRadius: 2,
          background: active ? 'var(--accent-ink)' : (i <= n ? 'var(--text)' : 'var(--text-3)'),
          opacity: i <= n ? 1 : 0.3,
        }} />
      ))}
    </div>
  );
}
export function ActivityScreen({ data, set, next, back, progress }: { data: OnboardData; set: Set; next: () => void; back: () => void; progress: Progress }) {
  const sel = data.activity;
  return (
    <ScreenShell onBack={back} progress={progress}
      footer={<PrimaryButton disabled={!sel} onClick={next} icon={<IconArrow size={20} />}>Continue</PrimaryButton>}>
      <div style={{ paddingTop: 10 }}>
        <Title sub="Be honest — we'll start where you are and build from there.">How active are you?</Title>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          {LEVELS.map((l) => {
            const on = sel === l.id;
            return (
              <button key={l.id} onClick={() => set({ activity: l.id })} style={{
                textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', borderRadius: 'var(--r-card)', padding: '15px 16px',
                border: on ? '1.5px solid var(--accent)' : '1px solid var(--hair)', background: on ? 'var(--accent-soft)' : 'var(--bg-elev)',
                display: 'flex', alignItems: 'center', gap: 14, transition: 'background .18s, border-color .18s',
              }}>
                <div style={{
                  width: 42, height: 42, borderRadius: 12, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: on ? 'var(--accent)' : 'var(--bg-elev2)',
                }}><Bars n={l.bars} active={on} /></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16.5, fontWeight: 600, color: 'var(--text)', letterSpacing: -0.2 }}>{l.label}</div>
                  <div style={{ fontSize: 13.5, color: 'var(--text-2)', marginTop: 2 }}>{l.desc}</div>
                </div>
                <div style={{
                  width: 22, height: 22, borderRadius: 999, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: on ? 'none' : '1.5px solid var(--hair)', background: on ? 'var(--accent)' : 'transparent', color: 'var(--accent-ink)',
                }}>{on && <IconCheck size={15} />}</div>
              </button>
            );
          })}
        </div>
      </div>
    </ScreenShell>
  );
}

/* ───────── 6 · Notify ───────── */
export function NotifyScreen({ next, back }: { next: () => void; back: () => void }) {
  const [alert, setAlert] = useState(false);
  return (
    <ScreenShell onBack={back}
      footer={
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <PrimaryButton onClick={() => setAlert(true)} icon={<IconBell size={19} />}>Turn on reminders</PrimaryButton>
          <GhostButton onClick={next}>Maybe later</GhostButton>
        </div>
      }>
      <div style={{ paddingTop: 26, textAlign: 'center' }}>
        <div style={{
          width: 96, height: 96, borderRadius: 30, margin: '0 auto 30px', background: 'var(--accent-soft)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', border: '1px solid var(--hair)',
        }}><IconBell size={42} /></div>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, letterSpacing: -0.5, color: 'var(--text)' }}>Stay on track</h1>
        <p style={{ margin: '12px auto 0', fontSize: 16, lineHeight: 1.5, color: 'var(--text-2)', maxWidth: 280 }}>
          Gentle nudges when it&apos;s time to move, and a little celebration when you hit a streak. No spam, ever.
        </p>
      </div>
      {alert && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)', padding: 40 }}>
          <div style={{ width: 270, borderRadius: 14, overflow: 'hidden', background: 'rgba(44,44,46,0.95)', fontFamily: '-apple-system, system-ui' }}>
            <div style={{ padding: '19px 16px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 17, fontWeight: 600, color: '#fff', lineHeight: 1.25 }}>&quot;Bloom&quot; Would Like to Send You Notifications</div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 4 }}>Notifications may include reminders, streaks and sounds.</div>
            </div>
            <div style={{ display: 'flex', borderTop: '0.5px solid rgba(255,255,255,0.18)' }}>
              <button onClick={() => { setAlert(false); next(); }} style={{ flex: 1, height: 44, border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: '-apple-system, system-ui', fontSize: 17, color: '#0a84ff' }}>Don&apos;t Allow</button>
              <div style={{ width: '0.5px', background: 'rgba(255,255,255,0.18)' }} />
              <button onClick={() => { setAlert(false); next(); }} style={{ flex: 1, height: 44, border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: '-apple-system, system-ui', fontSize: 17, color: '#0a84ff', fontWeight: 600 }}>Allow</button>
            </div>
          </div>
        </div>
      )}
    </ScreenShell>
  );
}

/* ───────── 7 · Done ───────── */
export function DoneScreen({ data, enter, busy }: { data: OnboardData; enter: () => void; busy?: boolean }) {
  const goalCount = (data.goals || []).length;
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)', padding: '0 26px 30px' }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center' }}>
        <div style={{
          width: 104, height: 104, borderRadius: 999, margin: '0 auto 34px', position: 'relative', display: 'flex',
          alignItems: 'center', justifyContent: 'center', background: 'var(--accent)', color: 'var(--accent-ink)',
        }}>
          <IconCheck size={52} />
          <div style={{ position: 'absolute', inset: -10, borderRadius: 999, border: '1.5px solid var(--accent)', opacity: 0.3 }} />
        </div>
        <h1 style={{ margin: 0, fontSize: 32, fontWeight: 750, letterSpacing: -0.8, color: 'var(--text)' }}>
          You&apos;re all set{data.name ? `, ${data.name}` : ''}!
        </h1>
        <p style={{ margin: '14px auto 0', fontSize: 16.5, lineHeight: 1.5, color: 'var(--text-2)', maxWidth: 290 }}>
          Your plan is ready{goalCount ? ` around your ${goalCount} goal${goalCount > 1 ? 's' : ''}` : ''}. Let&apos;s take the first step together.
        </p>
      </div>
      <PrimaryButton onClick={enter} disabled={busy} icon={<IconArrow size={20} />}>{busy ? '저장 중…' : 'Start moving'}</PrimaryButton>
    </div>
  );
}
