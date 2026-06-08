// Date-range resolution for query_logs.
//
// The model sends calendar dates ("오늘" -> date_from = date_to = "2026-06-08")
// as bare YYYY-MM-DD strings. Postgres coerces a date-only string to
// "2026-06-08T00:00:00" in UTC, so:
//   * `logged_at <= "2026-06-08"` EXCLUDES everything logged after midnight —
//     a same-day query can never find same-day logs (confirmed live in QA: a
//     workout logged today returned "오늘은 기록이 없습니다").
//   * the bound is evaluated in UTC, but the user's "오늘" is a calendar day in
//     their own timezone (Asia/Seoul, +09:00).
//
// We fix both by expanding a date-only bound to the *inclusive* start/end of
// that calendar day in the user's timezone, then handing the repository a full
// UTC instant. Full timestamps pass through untouched.

const DEFAULT_TZ = 'Asia/Seoul';
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

// Milliseconds to add to a UTC instant to get the wall-clock reading in `tz`
// (e.g. +09:00 -> +32400000). Computed from the zone so non-Seoul users work too.
function tzOffsetMs(instant: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(instant)) p[part.type] = part.value;
  // 'hour' can come back as '24' at midnight in some engines — normalize.
  const hour = p.hour === '24' ? 0 : Number(p.hour);
  const asUtc = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    hour, Number(p.minute), Number(p.second),
  );
  return asUtc - instant.getTime();
}

// The UTC instant for a given wall-clock time in `tz`.
function wallTimeToUtc(
  y: number, mo: number, d: number,
  h: number, mi: number, s: number, ms: number, tz: string,
): Date {
  // Compute the offset on a millisecond-zeroed instant: Intl.formatToParts drops
  // sub-second precision, so a non-zero ms here would corrupt the offset. Zone
  // offsets are always minute-aligned, so dropping ms for the offset is exact;
  // we re-apply the full-precision ms to the result.
  const offset = tzOffsetMs(new Date(Date.UTC(y, mo - 1, d, h, mi, s, 0)), tz);
  return new Date(Date.UTC(y, mo - 1, d, h, mi, s, ms) - offset);
}

/**
 * The local calendar date (YYYY-MM-DD) and ISO weekday (1=Mon … 7=Sun) for an
 * instant in `tz`. gpt-4o-mini cannot reliably compute weekday/week boundaries,
 * so we compute them in code and inject the result into the system prompt.
 */
export function zonedToday(
  nowIso: string,
  tz: string = DEFAULT_TZ,
): { date: string; weekday: number } {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, weekday: 'short',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(new Date(nowIso))) p[part.type] = part.value;
  const date = `${p.year}-${p.month}-${p.day}`;
  const wk: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return { date, weekday: wk[p.weekday] ?? 1 };
}

/** Add (or subtract) whole days to a YYYY-MM-DD string, returning YYYY-MM-DD. */
export function addDays(dateStr: string, n: number): string {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/**
 * Resolve a query date bound to an inclusive UTC ISO string.
 * - undefined -> undefined (no bound).
 * - "YYYY-MM-DD" -> start (00:00:00.000) or end (23:59:59.999) of that day in `tz`.
 * - anything else (a full ISO timestamp) -> returned unchanged.
 */
export function resolveDateBound(
  value: string | undefined,
  edge: 'start' | 'end',
  tz: string = DEFAULT_TZ,
): string | undefined {
  if (!value) return undefined;
  const m = DATE_ONLY.exec(value.trim());
  if (!m) return value;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const utc = edge === 'start'
    ? wallTimeToUtc(y, mo, d, 0, 0, 0, 0, tz)
    : wallTimeToUtc(y, mo, d, 23, 59, 59, 999, tz);
  return utc.toISOString();
}
