import { describe, it, expect } from 'vitest';
import { resolveDateBound } from '@/lib/tools/dateRange';

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
