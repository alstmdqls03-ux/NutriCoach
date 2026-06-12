import { describe, it, expect } from 'vitest';
import {
  normalizeExercise, exerciseKey, buildWorkoutData, buildSleepData,
} from '@/lib/log/payload';

describe('payload builders', () => {
  it('normalizes exercise whitespace; key is lowercased', () => {
    expect(normalizeExercise('  벤치  프레스 ')).toBe('벤치 프레스');
    expect(exerciseKey('Bench  Press')).toBe('bench press');
  });

  it('builds workout contract jsonb and rounds reps/sets', () => {
    expect(buildWorkoutData({ exercise: ' 스쿼트 ', weight_kg: 80, reps: 5, sets: 5 }))
      .toEqual({ exercise: '스쿼트', weight_kg: 80, reps: 5, sets: 5 });
  });

  it('rejects empty exercise and bad numbers', () => {
    expect(() => buildWorkoutData({ exercise: '  ', weight_kg: 80, reps: 5, sets: 5 })).toThrow();
    expect(() => buildWorkoutData({ exercise: '스쿼트', weight_kg: -1, reps: 5, sets: 5 })).toThrow();
    expect(() => buildWorkoutData({ exercise: '스쿼트', weight_kg: 80, reps: 0, sets: 5 })).toThrow();
  });

  it('maps sleep hours → duration_min and quality → satisfaction', () => {
    expect(buildSleepData({ durationHours: 7.5, quality: '좋음' }))
      .toEqual({ duration_min: 450, satisfaction: 5 });
    expect(buildSleepData({ durationHours: 6, quality: '나쁨' }))
      .toEqual({ duration_min: 360, satisfaction: 1 });
  });

  it('rejects sleep with no time info and out-of-range duration', () => {
    expect(() => buildSleepData({})).toThrow();
    expect(() => buildSleepData({ durationHours: 0 })).toThrow();
    expect(() => buildSleepData({ durationHours: 25 })).toThrow();
  });
});
