const { addDays, mondayOf } = require('./dates');
const { currentStreak } = require('./streaks');

/**
 * Everything the habits screens show, worked out from the habits and their logs.
 * @param {Array<{ id: string; name: string } & Record<string, unknown>>} habits active habits
 * @param {Array<{ habit_id: string; log_date: string }>} logs done days
 * @param {string} today
 * @param {number} days how many recent days to show per habit
 * @param {number} [heatmapWeeks]
 */
function habitBoard(habits, logs, today, days, heatmapWeeks = 20) {
  /** @type {Map<string, Set<string>>} */
  const doneBy = new Map(habits.map((h) => [h.id, new Set()]));
  for (const log of logs) doneBy.get(log.habit_id)?.add(log.log_date);

  const window = Array.from({ length: days }, (_, i) => addDays(today, i - (days - 1)));
  const items = habits.map((habit) => {
    const set = /** @type {Set<string>} */ (doneBy.get(habit.id));
    const done = window.map((day) => set.has(day));
    const count = done.filter(Boolean).length;
    return { ...habit, done, streak: currentStreak(set, today), share: Math.round((count / days) * 100) };
  });

  const total = items.length;
  const doneTotal = items.reduce((sum, h) => sum + h.done.filter(Boolean).length, 0);
  const best = items.reduce((top, h) => (h.streak > top.days ? { days: h.streak, name: h.name } : top), { days: 0, name: '' });
  const ranked = [...items].sort((a, b) => b.share - a.share);

  // One square per day, Monday-aligned weeks; future days have no value.
  const start = addDays(mondayOf(today), -(heatmapWeeks - 1) * 7);
  const heatmap = Array.from({ length: heatmapWeeks * 7 }, (_, i) => {
    const date = addDays(start, i);
    if (date > today) return { date, share: null };
    let doneCount = 0;
    for (const set of doneBy.values()) if (set.has(date)) doneCount += 1;
    return { date, share: total ? doneCount / total : 0 };
  });

  return {
    days: window,
    items,
    heatmap,
    summary: {
      total,
      done_today: items.filter((h) => h.done[days - 1]).length,
      best,
      share: total ? Math.round((doneTotal / (total * days)) * 100) : 0,
      perfect_days: total ? window.filter((_, i) => items.every((h) => h.done[i])).length : 0,
      most_consistent: ranked[0] ? { name: ranked[0].name, share: ranked[0].share } : null,
      needs_attention: ranked.length > 1 ? { name: ranked[ranked.length - 1].name, share: ranked[ranked.length - 1].share } : null,
    },
  };
}

module.exports = { habitBoard };
