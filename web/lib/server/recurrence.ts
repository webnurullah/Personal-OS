import { addDays, daysBetween } from "./dates.ts";

type Repeating = { event_date: string; repeat: string; repeat_until: string | null };

/**
 * Days on which an event happens between `from` and `to` (both included).
 * Repeating events ('daily', 'weekly') run from event_date until repeat_until.
 */
export function occurrences(event: Repeating, from: string, to: string): string[] {
  if (event.repeat === "none") {
    return event.event_date >= from && event.event_date <= to ? [event.event_date] : [];
  }
  const step = event.repeat === "weekly" ? 7 : 1;
  const last = event.repeat_until && event.repeat_until < to ? event.repeat_until : to;
  let day = event.event_date;
  if (day < from) day = addDays(day, Math.ceil(daysBetween(day, from) / step) * step);
  const days: string[] = [];
  for (; day <= last; day = addDays(day, step)) days.push(day);
  return days;
}

type Timed = { all_day: boolean; start_time: string | null };

/** Sort helper: all-day events first, then by start time. */
export function byTime(a: Timed, b: Timed) {
  if (a.all_day !== b.all_day) return a.all_day ? -1 : 1;
  return (a.start_time || "").localeCompare(b.start_time || "");
}
