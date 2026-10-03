const { Router } = require('express');
const { must } = require('../lib/http');
const { getProfile, forgetProfile } = require('../lib/profile');
const { todayIn, addDays, minutesNowIn, mondayOf, weekdayIndex, startOfDayUtc, daysBetween } = require('../lib/dates');
const { occurrences, byTime } = require('../lib/recurrence');
const { loadHabits } = require('./habits');
const { habitBoard } = require('../lib/habits');

const router = Router();

/** @param {number} n @param {string} word */
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "13:30" → "1:30 PM", or "13:30" for the 24-hour setting. @param {string} hhmm @param {string} format */
function clock(hhmm, format) {
  if (format === '24h') return hhmm.slice(0, 5);
  const h = Number(hhmm.slice(0, 2));
  return `${h % 12 || 12}:${hhmm.slice(3, 5)} ${h < 12 ? 'AM' : 'PM'}`;
}

// In-app notifications, worked out from your data and your Settings → Notifications choices.
router.get('/', async (req, res) => {
  const profile = await getProfile(req);
  const zone = profile.timezone;
  const today = todayIn(zone);
  const notify = /** @type {Record<string, boolean>} */ (profile.notify || {});
  const nowMinutes = minutesNowIn(zone);

  const [overdue, todayTasks, bills, events, blocks, habitData] = await Promise.all([
    req.db.from('tasks').select('id', { count: 'exact', head: true }).is('done_at', null).lt('due_date', today),
    req.db.from('tasks').select('id', { count: 'exact', head: true }).is('done_at', null).eq('due_date', today),
    req.db.from('bills').select('*').is('paid_at', null).lte('due_date', addDays(today, 3)).order('due_date').then(must),
    req.db.from('events').select('*').lte('event_date', today).or(`repeat.neq.none,event_date.eq.${today}`).then(must),
    req.db.from('study_blocks').select('*').eq('week_start', mondayOf(today)).eq('weekday', weekdayIndex(today)).eq('done', false).then(must),
    notify.habit_reminder ? loadHabits(req, today) : Promise.resolve(null),
  ]);

  /** @type {Array<{ id: string; icon: string; tone: string; title: string; meta: string; href: string }>} */
  const items = [];

  if (overdue.count) items.push({ id: 'overdue', icon: 'circle-alert', tone: 'rose', title: `${plural(overdue.count, 'task')} overdue`, meta: 'Tasks', href: '/tasks' });

  if (notify.morning_plan) {
    const todayEvents = events.filter((e) => occurrences(e, today, today).length);
    items.push({ id: 'plan', icon: 'sunrise', tone: 'amber', title: `Today: ${plural(todayTasks.count || 0, 'task')} and ${plural(todayEvents.length, 'event')}`, meta: 'Your day', href: '/' });
  }

  if (notify.bills_due) {
    for (const bill of bills) {
      const days = daysBetween(today, bill.due_date);
      const when = days < 0 ? `overdue by ${plural(-days, 'day')}` : days === 0 ? 'due today' : `due in ${plural(days, 'day')}`;
      items.push({ id: `bill-${bill.id}`, icon: 'receipt', tone: days < 0 ? 'rose' : 'amber', title: `${bill.name} is ${when}`, meta: 'Finance', href: '/finance' });
    }
  }

  // The next event still to come today.
  const next = events
    .filter((e) => !e.all_day && occurrences(e, today, today).length && e.start_time && Number(e.start_time.slice(0, 2)) * 60 + Number(e.start_time.slice(3, 5)) > nowMinutes)
    .sort(byTime)[0];
  if (next) items.push({ id: `event-${next.id}`, icon: 'calendar-clock', tone: 'blue', title: `Next: ${next.title} at ${clock(next.start_time || '', profile.time_format)}`, meta: 'Calendar', href: '/calendar' });

  if (notify.study_sessions) {
    for (const block of blocks) items.push({ id: `study-${block.id}`, icon: 'graduation-cap', tone: 'indigo', title: `Study today: ${block.activity} (${Number(block.hours)}h)`, meta: 'Learning', href: '/learning' });
  }

  if (habitData && nowMinutes >= 18 * 60) {
    const board = habitBoard(habitData.habits, habitData.logs, today, 1, 1);
    const left = board.summary.total - board.summary.done_today;
    if (left > 0) items.push({ id: 'habits', icon: 'repeat', tone: 'emerald', title: `${plural(left, 'habit')} left for today`, meta: 'Habits', href: '/habits' });
  }

  if (notify.weekly_review && weekdayIndex(today) === 6) {
    items.push({ id: 'review', icon: 'notebook-pen', tone: 'violet', title: 'Time for your weekly review', meta: 'Notes', href: '/notes' });
  }

  // "Mark all as read" covers everything until the next day.
  const readToday = Boolean(profile.notifications_read_at && profile.notifications_read_at >= startOfDayUtc(today, zone));
  res.json({ items, unread: readToday ? 0 : items.length });
});

router.post('/read', async (req, res) => {
  must(await req.db.from('profiles').update({ notifications_read_at: new Date().toISOString() }).eq('id', req.user.id).select('id').single());
  forgetProfile(req.user.id);
  res.json({ ok: true });
});

module.exports = router;
