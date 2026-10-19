// Habits fed by timers: how much time counts for a habit today, and whether its daily goal is reached. Plain functions, shared by the server and tests.
import { dayOf, MAX_SESSION_SECONDS } from "./project-time.ts";

/** A timer session: key is "project:<id>" or "course:<id>" (a certificate course counts as its course). */
export type SourceRow = { key: string; started_at: string; ended_at: string | null };

/**
 * Whole minutes counted today for a habit. A session counts on the day it STARTED (in the time zone of the person), a running one up to `now`.
 * Only sessions of the habit's sources count. Sessions that overlap (two timers at the same time) are counted once.
 */
export function minutesToday(rows: SourceRow[], sources: Set<string>, today: string, zone: string, now: number) {
  const spans = rows
    .filter((r) => sources.has(r.key) && dayOf(r.started_at, zone) === today)
    .map((r) => {
      const start = new Date(r.started_at).getTime();
      const end = r.ended_at ? new Date(r.ended_at).getTime() : now;
      return [start, Math.min(end, start + MAX_SESSION_SECONDS * 1000)] as const;
    })
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let from = -Infinity;
  for (const [start, end] of spans) {
    const s = Math.max(start, from);
    if (end > s) total += end - s;
    from = Math.max(from, end);
  }
  return Math.floor(total / 60000);
}

/** The goal is reached when the minutes counted today are at least the goal. */
export const goalReached = (target: number | null | undefined, minutes: number) => target != null && target > 0 && minutes >= target;

/** "1h 12m" for a number of minutes ("45m", "2h"). */
export function minutesText(minutes: number) {
  const m = Math.max(0, Math.floor(minutes));
  const h = Math.floor(m / 60);
  if (!h) return `${m}m`;
  return m % 60 ? `${h}h ${String(m % 60).padStart(2, "0")}m` : `${h}h`;
}
