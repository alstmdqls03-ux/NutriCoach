import { describe, it, expect } from 'vitest';
import { distinctLocalDays, streakEndingToday, computeStreakInsight } from '@/lib/insights/streak';
import type { LogRow } from '@/lib/repositories/types';

const row = (logged_at: string): LogRow => ({ id: 'x', type: 'workout', data: {}, logged_at });

describe('streak insight', () => {
  it('dedups multiple logs on the same local day', () => {
    const days = distinctLocalDays([
      row('2026-06-12T01:00:00Z'),
      row('2026-06-12T09:00:00Z'),
    ]);
    expect(days.size).toBe(1);
    expect(days.has('2026-06-12')).toBe(true);
  });

  it('counts consecutive days ending today', () => {
    const days = new Set(['2026-06-10', '2026-06-11', '2026-06-12']);
    expect(streakEndingToday(days, '2026-06-12')).toBe(3);
  });

  it('stops the streak at a gap', () => {
    const days = new Set(['2026-06-09', '2026-06-12']);
    expect(streakEndingToday(days, '2026-06-12')).toBe(1);
  });

  it('cold-start copy on the first-ever day', () => {
    const line = computeStreakInsight([row('2026-06-12T02:00:00Z')], '2026-06-12T02:00:00Z');
    expect(line).toMatch(/첫 기록/);
  });

  it('streak copy with the count when >= 2 consecutive days', () => {
    const line = computeStreakInsight(
      [row('2026-06-11T02:00:00Z'), row('2026-06-12T02:00:00Z')],
      '2026-06-12T02:00:00Z',
    );
    expect(line).toMatch(/연속 2일/);
  });

  it('gap fallback: history exists but yesterday missing → encouragement, no fabricated number', () => {
    const line = computeStreakInsight(
      [row('2026-06-09T02:00:00Z'), row('2026-06-12T02:00:00Z')],
      '2026-06-12T02:00:00Z',
    );
    expect(line).toMatch(/다시 시작/);
    expect(line).not.toMatch(/연속/);
  });
});
