import { describe, it, expect } from 'vitest';
import { resolveDateBound, zonedToday, addDays } from '@/lib/tools/dateRange';

describe('zonedToday', () => {
  it('returns the local date and weekday for an instant in Asia/Seoul', () => {
    // 2026-06-08T05:00:00Z === 14:00 KST on Mon 2026-06-08
    expect(zonedToday('2026-06-08T05:00:00.000Z', 'Asia/Seoul'))
      .toEqual({ date: '2026-06-08', weekday: 1 }); // Monday
  });

  it('rolls to the next local day when UTC instant is the previous evening', () => {
    // 2026-06-07T16:00:00Z === 2026-06-08 01:00 KST → still Monday the 8th
    expect(zonedToday('2026-06-07T16:00:00.000Z', 'Asia/Seoul'))
      .toEqual({ date: '2026-06-08', weekday: 1 });
  });
});

describe('addDays', () => {
  it('adds and subtracts days across month boundaries', () => {
    expect(addDays('2026-06-08', -1)).toBe('2026-06-07');
    expect(addDays('2026-06-08', -7)).toBe('2026-06-01');
    expect(addDays('2026-06-08', 6)).toBe('2026-06-14');
    expect(addDays('2026-06-01', -1)).toBe('2026-05-31'); // month rollover
  });

  it('computes this-week (Mon) and last-week from a Monday correctly', () => {
    const { date, weekday } = zonedToday('2026-06-08T05:00:00.000Z', 'Asia/Seoul');
    const mon = addDays(date, -(weekday - 1));
    expect(mon).toBe('2026-06-08');            // Monday = today
    expect(addDays(mon, 6)).toBe('2026-06-14'); // Sunday
    expect(addDays(mon, -7)).toBe('2026-06-01'); // last Monday
    expect(addDays(mon, -1)).toBe('2026-06-07'); // last Sunday
  });
});

describe('resolveDateBound', () => {
  it('expands a date-only start bound to 00:00 of that day in Asia/Seoul (UTC)', () => {
    // 2026-06-08 00:00 KST === 2026-06-07 15:00 UTC
    expect(resolveDateBound('2026-06-08', 'start', 'Asia/Seoul'))
      .toBe('2026-06-07T15:00:00.000Z');
  });

  it('expands a date-only end bound to 23:59:59.999 of that day in Asia/Seoul (UTC)', () => {
    // 2026-06-08 23:59:59.999 KST === 2026-06-08 14:59:59.999 UTC
    expect(resolveDateBound('2026-06-08', 'end', 'Asia/Seoul'))
      .toBe('2026-06-08T14:59:59.999Z');
  });

  it('a same-day range [start,end] contains a log made midday that day', () => {
    const from = resolveDateBound('2026-06-08', 'start', 'Asia/Seoul')!;
    const to = resolveDateBound('2026-06-08', 'end', 'Asia/Seoul')!;
    const loggedAt = '2026-06-08T04:09:04.506Z'; // 13:09 KST — the live QA repro
    expect(from <= loggedAt && loggedAt <= to).toBe(true);
  });

  it('honors a non-Seoul timezone', () => {
    expect(resolveDateBound('2026-06-08', 'start', 'UTC')).toBe('2026-06-08T00:00:00.000Z');
    expect(resolveDateBound('2026-06-08', 'end', 'UTC')).toBe('2026-06-08T23:59:59.999Z');
  });

  it('passes a full ISO timestamp through unchanged', () => {
    expect(resolveDateBound('2026-06-08T12:00:00.000Z', 'start', 'Asia/Seoul'))
      .toBe('2026-06-08T12:00:00.000Z');
  });

  it('returns undefined for an absent bound', () => {
    expect(resolveDateBound(undefined, 'start')).toBeUndefined();
  });
});
