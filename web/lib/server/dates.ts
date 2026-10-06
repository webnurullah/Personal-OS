// Dates are 'YYYY-MM-DD' strings in the user's own time zone.
// The server runs in UTC, so "today" is always worked out for the user's zone.
import { addDays, daysBetween, fromMs, mondayOf, toMs, weekdayIndex } from "../dates.ts";

export { addDays, daysBetween, mondayOf, weekdayIndex };

const FALLBACK_ZONE = "Asia/Dhaka";

export function safeZone(zone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone;
  } catch {
    return FALLBACK_ZONE;
  }
}

/** The date of a moment in a time zone. */
export function dateIn(moment: Date, zone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: safeZone(zone), year: "numeric", month: "2-digit", day: "2-digit" }).format(moment);
}

export const todayIn = (zone: string) => dateIn(new Date(), zone);

/** Minutes since midnight right now, in a time zone. */
export function minutesNowIn(zone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: safeZone(zone), hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value || 0);
  return get("hour") * 60 + get("minute");
}

/** First and last day of a 'YYYY-MM' month. */
export function monthRange(month: string) {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7)) - 1;
  return { first: fromMs(Date.UTC(year, index, 1)), last: fromMs(Date.UTC(year, index + 1, 0)) };
}

/** How far a time zone is ahead of UTC at a moment, in ms (Dhaka: +6 hours). */
function zoneOffsetMs(moment: Date, zone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: safeZone(zone), hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(moment);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value || 0);
  const wallClockAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return wallClockAsUtc - Math.floor(moment.getTime() / 60000) * 60000;
}

/** Start of a local day as a UTC timestamp, e.g. for "done today". */
export function startOfDayUtc(iso: string, zone: string) {
  const offset = zoneOffsetMs(new Date(toMs(iso) + 12 * 3600000), zone);
  return new Date(toMs(iso) - offset).toISOString();
}
