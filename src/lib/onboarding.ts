import type { OnboardingData, ProfileRepository } from '@/lib/repositories/types';

const ACTIVITY = ['start', 'light', 'moderate', 'very'];
const GOAL_IDS = ['lose', 'muscle', 'active', 'endurance', 'stress', 'eat'];

function num(v: unknown): number | undefined {
  const n = typeof v === 'string' ? parseInt(v, 10) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) && n > 0 && n < 1000 ? n : undefined;
}

/** Normalize the client onboarding payload (strings, goal allowlist) and persist it. */
export async function handleOnboarding(body: unknown, profiles: ProfileRepository, userId: string): Promise<void> {
  const b = (body ?? {}) as Record<string, unknown>;
  const metric = b.units !== 'Imperial';
  const data: OnboardingData = {
    display_name: typeof b.name === 'string' ? b.name.trim().slice(0, 60) || undefined : undefined,
    goals: Array.isArray(b.goals) ? b.goals.filter((g): g is string => typeof g === 'string' && GOAL_IDS.includes(g)) : undefined,
    units: b.units === 'Imperial' ? 'Imperial' : 'Metric',
    height_cm: metric ? num(b.heightCm) : undefined,
    weight_kg: metric ? num(b.weightKg) : undefined,
    age: num(b.age),
    activity_level: typeof b.activity === 'string' && ACTIVITY.includes(b.activity) ? b.activity : undefined,
  };
  await profiles.setOnboarding(userId, data);
}
