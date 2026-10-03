// Dates are 'YYYY-MM-DD' strings in the user's own time zone.
// The server may run in UTC, so "today" is always worked out for the user's zone.

const DAY_MS = 86400000;
const FALLBACK_ZONE = 'Asia/Dhaka';

/** @param {string} zone */
function safeZone(zone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return zone;
  } catch {
    return FALLBACK_ZONE;
  }
}

/** Date of a moment in a time zone. @param {Date} moment @param {string} zone */
function dateIn(moment, zone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: safeZone(zone), year: 'numeric', month: '2-digit', day: '2-digit' }).format(moment);
}

/** @param {string} zone */
const todayIn = (zone) => dateIn(new Date(), zone);

/** Minutes since midnight right now, in a time zone. @param {string} zone */
function minutesNowIn(zone) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: safeZone(zone), hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const get = (/** @type {string} */ type) => Number(parts.find((p) => p.type === type)?.value || 0);
  return get('hour') * 60 + get('minute');
}

/** @param {string} iso */
const toMs = (iso) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
/** @param {number} ms */
const fromMs = (ms) => new Date(ms).toISOString().slice(0, 10);

/** @param {string} iso @param {number} days */
const addDays = (iso, days) => fromMs(toMs(iso) + days * DAY_MS);

/** Whole days from a to b (b later → positive). @param {string} a @param {string} b */
const daysBetween = (a, b) => Math.round((toMs(b) - toMs(a)) / DAY_MS);

/** 0 = Monday … 6 = Sunday. @param {string} iso */
const weekdayIndex = (iso) => (new Date(toMs(iso)).getUTCDay() + 6) % 7;

/** Monday of the week that contains the date. @param {string} iso */
const mondayOf = (iso) => addDays(iso, -weekdayIndex(iso));

/** First and last day of a 'YYYY-MM' month. @param {string} month */
function monthRange(month) {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7)) - 1;
  return { first: fromMs(Date.UTC(year, index, 1)), last: fromMs(Date.UTC(year, index + 1, 0)) };
}

/** How far a time zone is ahead of UTC at a moment, in ms (Dhaka: +6 hours). @param {Date} moment @param {string} zone */
function zoneOffsetMs(moment, zone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: safeZone(zone), hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(moment);
  const get = (/** @type {string} */ type) => Number(parts.find((p) => p.type === type)?.value || 0);
  const wallClockAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return wallClockAsUtc - Math.floor(moment.getTime() / 60000) * 60000;
}

/** Start of a local day as a UTC timestamp, e.g. for "done today". @param {string} iso @param {string} zone */
function startOfDayUtc(iso, zone) {
  const offset = zoneOffsetMs(new Date(toMs(iso) + 12 * 3600000), zone);
  return new Date(toMs(iso) - offset).toISOString();
}

module.exports = { safeZone, dateIn, todayIn, minutesNowIn, addDays, daysBetween, weekdayIndex, mondayOf, monthRange, startOfDayUtc };
