// Finds dates and times written in plain words ("tomorrow", "15 oct", "next friday", "3pm-4:30pm").
// Used by Quick Add and by the job reader (to find "Application Deadline: 20 Oct 2026"), so it works
// in the browser and on the server, with no AI. Days are Monday-first like the rest of the app.
import { addDays, fromMs, weekdayIndex } from "./dates.ts";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_RE = "(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?";
const SEP = "[\\s\\-\\/.,]*";
const WEEKDAY_RE = "(?:next\\s+|this\\s+|on\\s+)?(monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat|sunday|sun)";
const WEEKDAYS: Record<string, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };

export type Found<T> = { value: T; rest: string };

const tidy = (text: string) => text.replace(/\s{2,}/g, " ").trim();
const cut = (text: string, m: RegExpMatchArray) => tidy(`${text.slice(0, m.index)} ${text.slice((m.index ?? 0) + m[0].length)}`);

function valid(y: number, m: number, d: number) {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}
const iso = (y: number, m: number, d: number) => fromMs(Date.UTC(y, m - 1, d));

/** A day and month with no year: this year, or next year when it has already passed (and `future` is on). */
function withYear(m: number, d: number, today: string, future: boolean) {
  const year = Number(today.slice(0, 4));
  if (!valid(year, m, d)) return null;
  const date = iso(year, m, d);
  if (future && date < today) return valid(year + 1, m, d) ? iso(year + 1, m, d) : null;
  return date;
}

/**
 * The first date in the text, as YYYY-MM-DD, with the date words removed from the rest.
 * Understands: 2026-10-15 · 15/10/2026 · 15 oct (2026) · oct 15 (2026) · today · tomorrow ·
 * yesterday · in 3 days · in 2 weeks · friday · next monday.
 * `today` is the user's today. `future`: a date without a year that has passed means next year.
 */
export function extractDate(text: string, today: string, { future = true } = {}): Found<string> | null {
  let m: RegExpMatchArray | null;

  if ((m = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/)) && valid(+m[1], +m[2], +m[3])) return { value: iso(+m[1], +m[2], +m[3]), rest: cut(text, m) };

  // Day first: this is how dates are written in Bangladesh.
  if ((m = text.match(/\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})\b/)) && valid(+m[3], +m[2], +m[1])) return { value: iso(+m[3], +m[2], +m[1]), rest: cut(text, m) };

  if ((m = text.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?${SEP}${MONTH_RE}(?:${SEP}(\\d{4}))?(?!\\d)`, "i")))) {
    const month = MONTHS.indexOf(m[2].toLowerCase()) + 1;
    const value = m[3] ? (valid(+m[3], month, +m[1]) ? iso(+m[3], month, +m[1]) : null) : withYear(month, +m[1], today, future);
    if (value) return { value, rest: cut(text, m) };
  }

  if ((m = text.match(new RegExp(`\\b${MONTH_RE}${SEP}(\\d{1,2})(?:st|nd|rd|th)?(?!\\d)(?:${SEP}(\\d{4}))?(?!\\d)`, "i")))) {
    const month = MONTHS.indexOf(m[1].toLowerCase()) + 1;
    const value = m[3] ? (valid(+m[3], month, +m[2]) ? iso(+m[3], month, +m[2]) : null) : withYear(month, +m[2], today, future);
    if (value) return { value, rest: cut(text, m) };
  }

  if ((m = text.match(/\bday after tomorrow\b/i))) return { value: addDays(today, 2), rest: cut(text, m) };
  if ((m = text.match(/\b(?:tomorrow|tmrw|tmr)\b/i))) return { value: addDays(today, 1), rest: cut(text, m) };
  if ((m = text.match(/\btoday\b/i))) return { value: today, rest: cut(text, m) };
  if ((m = text.match(/\byesterday\b/i))) return { value: addDays(today, -1), rest: cut(text, m) };
  if ((m = text.match(/\bin\s+(\d{1,3})\s*(day|days|week|weeks)\b/i))) return { value: addDays(today, +m[1] * (m[2].toLowerCase().startsWith("w") ? 7 : 1)), rest: cut(text, m) };

  if ((m = text.match(new RegExp(`\\b${WEEKDAY_RE}\\b`, "i")))) {
    const target = WEEKDAYS[m[1].slice(0, 3).toLowerCase()];
    // The next one: "friday" on a Friday means a week from now ("today" says today).
    const ahead = (target - weekdayIndex(today) + 7) % 7 || 7;
    return { value: addDays(today, ahead), rest: cut(text, m) };
  }
  return null;
}

/** A clock time as "HH:MM", or null if the numbers do not make a time. */
function clock(hour: number, minute: number, ap?: string) {
  const a = ap?.toLowerCase();
  if (a) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (a === "pm" ? 12 : 0);
  } else if (hour > 23) return null;
  if (minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

const T = "(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)?";

/**
 * A time or a time range: "3pm", "at 3:30 pm", "15:00", "3pm-4pm", "3-4:30pm", "10:00 to 11:30".
 * A bare number is not a time ("buy 2 apples"): it needs am/pm or a colon.
 */
export function extractTime(text: string): Found<{ start: string; end: string | null }> | null {
  const range = text.match(new RegExp(`(?:\\bat\\s+)?\\b${T}\\s*(?:-|–|—|to|until)\\s*${T}(?![\\d:])`, "i"));
  if (range) {
    const [, h1, m1, a1, h2, m2, a2] = range;
    const rightClear = Boolean(m2 || a2);
    const leftClear = Boolean(m1 || a1 || a2);
    if (rightClear && leftClear) {
      const start = clock(+h1, +(m1 ?? 0), a1 ?? a2);
      const end = clock(+h2, +(m2 ?? 0), a2 ?? a1);
      if (start && end) return { value: { start, end }, rest: cut(text, range) };
    }
  }
  let m = text.match(/(?:\bat\s+)?\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (m) {
    const start = clock(+m[1], +(m[2] ?? 0), m[3]);
    if (start) return { value: { start, end: null }, rest: cut(text, m) };
  }
  m = text.match(/(?:\bat\s+)?\b(\d{1,2}):(\d{2})\b/);
  if (m) {
    const start = clock(+m[1], +m[2]);
    if (start) return { value: { start, end: null }, rest: cut(text, m) };
  }
  return null;
}
