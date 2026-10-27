// Habits → the date range of the tracker: last 7 days, a calendar week, a calendar month or two dates picked by hand.
// Plain functions, shared by the page and the API (so the same rules apply on both sides).
import { addDays, addMonths, daysBetween, formatDate } from "./dates.ts";

export type RangePreset = "7d" | "week" | "month" | "custom";
export type HabitWindow = { from: string; to: string };

/** The longest range that can be shown, and how far back it may start (streaks read 400 days of ticks). */
export const MAX_RANGE_DAYS = 92;
export const MAX_LOOKBACK_DAYS = 400;

const weekdayFrom = (iso: string, weekStart: number) => (new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))).getUTCDay() - weekStart + 7) % 7;

/** Number of days in a window (both ends count). */
export const windowDays = (w: HabitWindow) => daysBetween(w.from, w.to) + 1;

/** Every day of a window, oldest first. */
export const windowList = (w: HabitWindow) => Array.from({ length: windowDays(w) }, (_, i) => addDays(w.from, i));

/**
 * The window of a preset. `offset` goes back whole weeks or months (0 = this one, -1 = the one before …).
 * A week or month that has not ended yet stops at today. `weekStart`: 0 Sunday … 6 Saturday (the profile's first weekday).
 */
export function presetWindow(preset: Exclude<RangePreset, "custom">, today: string, offset = 0, weekStart = 1): HabitWindow {
  if (preset === "7d") return { from: addDays(today, -6), to: today };
  if (preset === "week") {
    const first = addDays(addDays(today, -weekdayFrom(today, weekStart)), offset * 7);
    const last = addDays(first, 6);
    return { from: first, to: last > today ? today : last };
  }
  const month = addMonths(today.slice(0, 7), offset);
  const first = `${month}-01`;
  const last = addDays(`${addMonths(month, 1)}-01`, -1);
  return { from: first, to: last > today ? today : last };
}

/** What is wrong with a window ("" when it is fine). */
export function windowProblem(w: { from: string; to: string }, today: string) {
  if (!w.from || !w.to) return "Pick both dates, From and To.";
  if (w.to < w.from) return "The end date cannot be before the start date.";
  if (w.to > today) return "The end date cannot be after today.";
  if (windowDays(w) > MAX_RANGE_DAYS) return `A range can be at most ${MAX_RANGE_DAYS} days.`;
  if (daysBetween(w.from, today) > MAX_LOOKBACK_DAYS) return `The range cannot start more than ${MAX_LOOKBACK_DAYS} days ago.`;
  return "";
}

/** The title of the card: "Last 7 days", "Oct 20 – Oct 26", "October 2026", "Oct 3 – Nov 12". */
export function windowTitle(preset: RangePreset, w: HabitWindow) {
  if (preset === "7d") return "Last 7 days";
  if (preset === "month") return formatDate(w.from, "month");
  const short = (d: string) => formatDate(d, "short");
  return w.from === w.to ? short(w.from) : `${short(w.from)} – ${short(w.to)}`;
}

/** The key of the habits answer for a window (the default last 7 days keeps the key the Dashboard shares). */
export const windowKey = (preset: RangePreset, w: HabitWindow) => (preset === "7d" ? "/habits?days=7" : `/habits?from=${w.from}&to=${w.to}`);
