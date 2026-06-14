import { describe, it, expect } from 'vitest';
import { experienceFromActivity } from '@/lib/coach/experience';

describe('experienceFromActivity', () => {
  it('maps very -> advanced', () => expect(experienceFromActivity('very')).toBe('advanced'));
  it('maps moderate -> intermediate', () => expect(experienceFromActivity('moderate')).toBe('intermediate'));
  it('maps start/light -> beginner', () => {
    expect(experienceFromActivity('start')).toBe('beginner');
    expect(experienceFromActivity('light')).toBe('beginner');
  });
  it('defaults null/undefined/unknown -> beginner', () => {
    expect(experienceFromActivity(null)).toBe('beginner');
    expect(experienceFromActivity(undefined)).toBe('beginner');
    expect(experienceFromActivity('zzz')).toBe('beginner');
  });
});
