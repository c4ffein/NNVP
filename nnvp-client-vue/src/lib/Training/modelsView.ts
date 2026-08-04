/**
 * modelsView.ts — pure view settings for the Models window (Phase G
 * follow-up): timestamp formatting, the first/last-iteration choice, and the
 * day-granular date-range predicate. Shared by the timeline list AND the
 * evolution graph, so one filter bar rules both views.
 */

export type WhenMode = 'absolute' | 'relative';
export type SeenMode = 'first' | 'last';

/** Day-granular bounds, 'YYYY-MM-DD' or null = open end. */
export interface SeenRange {
  from: string | null;
  to: string | null;
}

const pad = (value: number) => String(value).padStart(2, '0');

/** Human distance, full words ("2 minutes ago"); future/near = "just now". */
function relativeWhen(thenMs: number, nowMs: number): string {
  const seconds = Math.floor((nowMs - thenMs) / 1000);
  if (seconds < 5) return 'just now'; // covers clock-skewed future stamps too
  const chain: [string, number][] = [
    ['second', 60], ['minute', 60], ['hour', 24], ['day', 30], ['month', 12],
  ];
  let value = seconds;
  for (const [unit, limit] of chain) {
    if (value < limit) return `${value} ${unit}${value === 1 ? '' : 's'} ago`;
    value = Math.floor(value / limit);
  }
  return `${value} year${value === 1 ? '' : 's'} ago`;
}

/** 'YYYY-MM-DD HH:MM' (local) or the human distance, per the setting. */
export function formatWhen(iso: string | null, mode: WhenMode, nowMs: number): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  if (mode === 'relative') return relativeWhen(date.getTime(), nowMs);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + ` ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Which iteration's timestamp represents a state, per the setting. */
export function pickSeen(
  first: string | null,
  last: string | null,
  mode: SeenMode,
): string | null {
  return (mode === 'last' ? last ?? first : first ?? last) ?? null;
}

/**
 * Day-granular, both ends inclusive ("edited between X and Y"). Undated
 * states pass only an unfiltered range — a filter never smuggles them in.
 */
export function inRange(iso: string | null, range: SeenRange): boolean {
  if (iso === null) return range.from === null && range.to === null;
  const day = iso.slice(0, 10);
  if (range.from !== null && day < range.from) return false;
  if (range.to !== null && day > range.to) return false;
  return true;
}
