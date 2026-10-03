// Dates are plain 'YYYY-MM-DD' calendar days. "Today" always comes from the API,
// which works it out in your time zone (Settings → Preferences).

export const DAY_MS = 86400000;

export const toMs = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
export const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (iso: string, days: number) => fromMs(toMs(iso) + days * DAY_MS);
export const daysBetween = (a: string, b: string) => Math.round((toMs(b) - toMs(a)) / DAY_MS);
/** 0 = Monday … 6 = Sunday */
export const weekdayIndex = (iso: string) => (new Date(toMs(iso)).getUTCDay() + 6) % 7;
export const mondayOf = (iso: string) => addDays(iso, -weekdayIndex(iso));

/** 'YYYY-MM' plus or minus whole months. */
export function addMonths(month: string, count: number) {
  const date = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + count, 1));
  return date.toISOString().slice(0, 7);
}

const formatter = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...options });
const formats = {
  full: formatter({ weekday: "short", month: "short", day: "numeric", year: "numeric" }), // Mon, Sep 21, 2026
  long: formatter({ weekday: "long", month: "long", day: "numeric" }), // Monday, September 21
  date: formatter({ month: "short", day: "numeric", year: "numeric" }), // Sep 21, 2026
  short: formatter({ month: "short", day: "numeric" }), // Sep 21
  weekday: formatter({ weekday: "short" }), // Mon
  weekdayLong: formatter({ weekday: "long" }), // Monday
  month: formatter({ month: "long", year: "numeric" }), // September 2026
  monthShort: formatter({ month: "short", year: "numeric" }), // Sep 2026
  gb: new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" }), // 31 Dec 2026
};

export function formatDate(iso: string, style: keyof typeof formats = "short") {
  const value = style === "month" || style === "monthShort" ? toMs(`${iso.slice(0, 7)}-01`) : toMs(iso);
  return formats[style].format(new Date(value));
}

/** "Today", "Yesterday", "Tomorrow", a weekday this week, or a short date. */
export function relativeDay(iso: string, today: string) {
  const diff = daysBetween(today, iso);
  if (diff === 0) return "Today";
  if (diff === -1) return "Yesterday";
  if (diff === 1) return "Tomorrow";
  if (diff > 1 && diff < 7) return formatDate(iso, "weekdayLong");
  return formatDate(iso, "short");
}

/** 42 days (6 weeks) for a month grid, starting on the chosen first weekday (0 Sunday … 6 Saturday). */
export function monthGrid(month: string, weekStart: number) {
  const first = `${month}-01`;
  const firstWeekday = new Date(toMs(first)).getUTCDay();
  const lead = (firstWeekday - weekStart + 7) % 7;
  const start = addDays(first, -lead);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

/** Short weekday names in grid order, e.g. ["Mon", "Tue", …]. */
export function weekdayNames(weekStart: number) {
  // 2026-01-04 is a Sunday.
  return Array.from({ length: 7 }, (_, i) => formatDate(addDays("2026-01-04", (weekStart + i) % 7), "weekday"));
}
