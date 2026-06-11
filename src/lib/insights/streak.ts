import { zonedToday, addDays } from '@/lib/tools/dateRange';
import type { LogRow } from '@/lib/repositories/types';

/** Distinct local calendar dates (YYYY-MM-DD in tz) present across the logs. */
export function distinctLocalDays(rows: LogRow[], tz = 'Asia/Seoul'): Set<string> {
  const days = new Set<string>();
  for (const r of rows) days.add(zonedToday(r.logged_at, tz).date);
  return days;
}

/** Consecutive-day streak ending at `today` (YYYY-MM-DD), inclusive. 0 if today absent. */
export function streakEndingToday(days: Set<string>, today: string): number {
  let n = 0;
  let cursor = today;
  while (days.has(cursor)) {
    n++;
    cursor = addDays(cursor, -1);
  }
  return n;
}

/**
 * One Korean insight line for the just-saved log. Never fabricates a number and
 * never returns empty (design Premise 3 + safe-fallback). Called right after an
 * insert, so today is always present in `rows`.
 */
export function computeStreakInsight(rows: LogRow[], nowIso: string, tz = 'Asia/Seoul'): string {
  const today = zonedToday(nowIso, tz).date;
  const days = distinctLocalDays(rows, tz);
  if (days.size <= 1) return '첫 기록 완료! 🎉 내일 또 오면 추세가 보이기 시작해요.';
  const streak = streakEndingToday(days, today);
  if (streak >= 2) return `연속 ${streak}일째 기록 중이에요 🔥`;
  return '다시 시작이에요! 오늘도 기록 완료 💪';
}
