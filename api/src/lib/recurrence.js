const { addDays, daysBetween } = require('./dates');

/**
 * Days on which an event happens between `from` and `to` (both included).
 * Repeating events ('daily', 'weekly') run from event_date until repeat_until.
 * @param {{ event_date: string; repeat: string; repeat_until: string | null }} event
 * @param {string} from
 * @param {string} to
 * @returns {string[]}
 */
function occurrences(event, from, to) {
  if (event.repeat === 'none') {
    return event.event_date >= from && event.event_date <= to ? [event.event_date] : [];
  }
  const step = event.repeat === 'weekly' ? 7 : 1;
  const last = event.repeat_until && event.repeat_until < to ? event.repeat_until : to;
  let day = event.event_date;
  if (day < from) day = addDays(day, Math.ceil(daysBetween(day, from) / step) * step);
  const days = [];
  for (; day <= last; day = addDays(day, step)) days.push(day);
  return days;
}

/**
 * Sort helper: all-day events first, then by start time.
 * @param {{ all_day: boolean; start_time: string | null }} a
 * @param {{ all_day: boolean; start_time: string | null }} b
 */
function byTime(a, b) {
  if (a.all_day !== b.all_day) return a.all_day ? -1 : 1;
  return (a.start_time || '').localeCompare(b.start_time || '');
}

module.exports = { occurrences, byTime };
