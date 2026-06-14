import { describe, it, expect } from 'vitest';
import { handleOnboarding } from '@/lib/onboarding';
import { FakeProfileRepository } from '../fakes/repositories';

describe('handleOnboarding', () => {
  it('normalizes the client payload (strings -> numbers, goal allowlist, name trim)', async () => {
    const repo = new FakeProfileRepository();
    await handleOnboarding(
      { name: '  Min  ', goals: ['muscle', 'active', 'BOGUS'], units: 'Metric', heightCm: '178', weightKg: '74', age: '29', activity: 'moderate' },
      repo, 'u1',
    );
    expect(repo.onboarding.get('u1')).toEqual({
      display_name: 'Min', goals: ['muscle', 'active'], units: 'Metric',
      height_cm: 178, weight_kg: 74, age: 29, activity_level: 'moderate',
    });
  });

  it('drops an invalid activity and out-of-range numbers; defaults units to Metric', async () => {
    const repo = new FakeProfileRepository();
    await handleOnboarding({ activity: 'superhuman', age: '0', heightCm: 'abc' }, repo, 'u2');
    const saved = repo.onboarding.get('u2')!;
    expect(saved.activity_level).toBeUndefined();
    expect(saved.age).toBeUndefined();
    expect(saved.height_cm).toBeUndefined();
    expect(saved.units).toBe('Metric');
  });

  it('omits metric height/weight when units are Imperial', async () => {
    const repo = new FakeProfileRepository();
    await handleOnboarding({ units: 'Imperial', heightCm: '178', weightKg: '74' }, repo, 'u3');
    const saved = repo.onboarding.get('u3')!;
    expect(saved.units).toBe('Imperial');
    expect(saved.height_cm).toBeUndefined();
    expect(saved.weight_kg).toBeUndefined();
  });
});
