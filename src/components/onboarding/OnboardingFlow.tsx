'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import {
  WelcomeScreen, AuthScreen, NameScreen, GoalsScreen, MetricsScreen,
  ActivityScreen, NotifyScreen, DoneScreen, type OnboardData,
} from './screens';

const STEPS = ['welcome', 'auth', 'name', 'goals', 'metrics', 'activity', 'notify', 'done'] as const;
const PROG: Record<string, number> = { name: 1, goals: 2, metrics: 3, activity: 4 };
const PROG_N = 4;
const LS_KEY = 'nutricoach_onboarding_v1';

export function OnboardingFlow() {
  const router = useRouter();
  const [i, setI] = useState(0);
  // Seed the metrics defaults shown on the Metrics screen so they persist when
  // the user accepts them by tapping Continue without editing.
  const [data, setData] = useState<OnboardData>({
    units: 'Metric', heightCm: '172', weightKg: '68', heightIn: '68', weightLb: '150', age: '28',
  });
  const [busy, setBusy] = useState(false);

  // restore progress
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { i: number; data: OnboardData };
        if (typeof saved.i === 'number') setI(Math.min(saved.i, STEPS.length - 1));
        if (saved.data) setData(saved.data);
      }
    } catch { /* ignore */ }
  }, []);
  // persist
  useEffect(() => {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ i, data })); } catch { /* ignore */ }
  }, [i, data]);

  const step = STEPS[i];
  const next = () => setI((n) => Math.min(n + 1, STEPS.length - 1));
  const back = () => setI((n) => Math.max(n - 1, 0));
  const set = (p: Partial<OnboardData> | ((d: OnboardData) => Partial<OnboardData>)) =>
    setData((d) => ({ ...d, ...(typeof p === 'function' ? p(d) : p) }));

  async function signUp(email: string, password: string): Promise<string | null> {
    const sb = supabaseBrowser();
    const { data: res, error } = await sb.auth.signUp({ email, password });
    if (error) return error.message;
    if (!res.session) return '이메일 인증이 필요해요. 메일함을 확인한 뒤 다시 시도하세요.';
    return null;
  }

  async function finish() {
    setBusy(true);
    try {
      await fetch('/api/onboarding', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data),
      });
      localStorage.removeItem(LS_KEY);
      router.refresh();
      router.push('/coach');
    } finally {
      setBusy(false);
    }
  }

  const progress = PROG[step] ? { n: PROG_N, i: PROG[step] } : undefined;

  return (
    <div className="bloom-slide" key={step}>
      {step === 'welcome' && <WelcomeScreen next={next} signIn={() => router.push('/login')} />}
      {step === 'auth' && <AuthScreen next={next} back={back} signUp={signUp} />}
      {step === 'name' && <NameScreen data={data} set={set} next={next} back={back} progress={progress!} />}
      {step === 'goals' && <GoalsScreen data={data} set={set} next={next} back={back} progress={progress!} />}
      {step === 'metrics' && <MetricsScreen data={data} set={set} next={next} back={back} progress={progress!} />}
      {step === 'activity' && <ActivityScreen data={data} set={set} next={next} back={back} progress={progress!} />}
      {step === 'notify' && <NotifyScreen next={next} back={back} />}
      {step === 'done' && <DoneScreen data={data} enter={finish} busy={busy} />}
    </div>
  );
}
