// Google Calendar events turned into days on this app's calendar. Pure functions (no network), so they can be tested.
import { addDays, daysBetween } from "./dates.ts";

/** One Google event on one day (an event that lasts several days gives one of these per day). */
export type GoogleEvent = {
  id: string;
  date: string;
  title: string;
  all_day: boolean;
  start_time: string | null;
  end_time: string | null;
  location: string;
  /** The event in Google Calendar (opens in a new tab). */
  link: string;
  calendar: string;
  /** The calendar's own colour, "#rrggbb". */
  color: string;
};

/** off: not connected. ok: showing. reconnect: Google no longer accepts the link. error: Google could not be reached just now. */
export type GoogleStatus = "off" | "ok" | "reconnect" | "error";

export type GoogleCalendarInfo = { id: string; name: string; color: string };

/** The parts of a Google event this app reads (https://developers.google.com/calendar/api/v3/reference/events). */
export type RawGoogleEvent = {
  id?: string;
  status?: string;
  summary?: string;
  location?: string;
  htmlLink?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  attendees?: { self?: boolean; responseStatus?: string }[];
};

const FALLBACK_COLOR = "#64748b";
const MAX_DAYS_PER_EVENT = 62;

/** A colour that is safe to put in a style: "#rrggbb" only. */
export function safeColor(value: unknown) {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : FALLBACK_COLOR;
}

/** Only web links to Google are opened from the calendar. */
export function safeGoogleLink(value: unknown) {
  if (typeof value !== "string") return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /(^|\.)google\.com$/.test(url.hostname) ? url.toString() : "";
  } catch {
    return "";
  }
}

/** The date ("YYYY-MM-DD") and time ("HH:MM") of a moment, as a clock in a time zone shows them. */
export function clockIn(moment: Date, zone: string) {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-GB", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(moment);
  } catch {
    return clockIn(moment, "Asia/Dhaka");
  }
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

const isDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);

/**
 * Days of one Google event inside from..to (both included), in the time zone of the person.
 * All-day events end the day BEFORE Google's end date. A timed event that crosses midnight shows its time on the first day and as
 * "all day" on the days after. Cancelled events and invitations you declined give nothing.
 */
export function normalizeGoogleEvent(raw: RawGoogleEvent, calendar: GoogleCalendarInfo, zone: string, from: string, to: string): GoogleEvent[] {
  if (!raw || raw.status === "cancelled") return [];
  if (raw.attendees?.some((a) => a.self && a.responseStatus === "declined")) return [];

  let first: string;
  let last: string;
  let allDay: boolean;
  let startTime: string | null = null;
  let endTime: string | null = null;

  if (raw.start?.dateTime) {
    const start = new Date(raw.start.dateTime);
    if (Number.isNaN(start.getTime())) return [];
    const end = raw.end?.dateTime ? new Date(raw.end.dateTime) : start;
    const a = clockIn(start, zone);
    const b = Number.isNaN(end.getTime()) || end.getTime() <= start.getTime() ? a : clockIn(end, zone);
    first = a.date;
    last = b.date;
    // Ending exactly at midnight belongs to the day before.
    if (last > first && b.time === "00:00") last = addDays(last, -1);
    if (last < first) last = first;
    allDay = false;
    startTime = a.time;
    endTime = last === first && b.date === a.date ? b.time : "23:59";
  } else if (isDate(raw.start?.date)) {
    first = raw.start.date;
    const endExclusive = isDate(raw.end?.date) ? raw.end.date : addDays(first, 1);
    last = addDays(endExclusive, -1);
    if (last < first) last = first;
    allDay = true;
  } else {
    return [];
  }

  const days: GoogleEvent[] = [];
  const stop = daysBetween(first, last) > MAX_DAYS_PER_EVENT ? addDays(first, MAX_DAYS_PER_EVENT) : last;
  const link = safeGoogleLink(raw.htmlLink);
  for (let day = first < from ? from : first; day <= stop && day <= to; day = addDays(day, 1)) {
    const firstDay = day === first;
    days.push({
      id: `${raw.id ?? "event"}@${calendar.id}@${day}`,
      date: day,
      title: (raw.summary ?? "").trim().slice(0, 200) || "(No title)",
      all_day: allDay || !firstDay,
      start_time: allDay || !firstDay ? null : startTime,
      end_time: allDay || !firstDay ? null : endTime,
      location: (raw.location ?? "").trim().slice(0, 200),
      link,
      calendar: calendar.name,
      color: calendar.color,
    });
  }
  return days;
}

/** All-day first, then by time, then by title: the order a day reads in. */
export function sortGoogleEvents(list: GoogleEvent[]) {
  return [...list].sort((a, b) => a.date.localeCompare(b.date) || Number(b.all_day) - Number(a.all_day) || (a.start_time ?? "").localeCompare(b.start_time ?? "") || a.title.localeCompare(b.title));
}
