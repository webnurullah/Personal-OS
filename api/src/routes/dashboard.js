const { Router } = require('express');
const { must, dbError } = require('../lib/http');
const { getProfile } = require('../lib/profile');
const { todayIn, addDays, monthRange, startOfDayUtc, dateIn } = require('../lib/dates');
const { fetchAll } = require('../lib/paging');
const { occurrences, byTime } = require('../lib/recurrence');
const { habitBoard } = require('../lib/habits');
const { withProgress } = require('../lib/goals');
const { loadHabits } = require('./habits');

const router = Router();

// Everything on the dashboard in one request. Every number is worked out
// here from the stored facts (ticked tasks, habit days, transactions …).
router.get('/', async (req, res) => {
  const profile = await getProfile(req);
  const zone = profile.timezone;
  const today = todayIn(zone);
  const { first: monthStart, last: monthEnd } = monthRange(today.slice(0, 7));

  const [events, openTasks, recentlyDone, habitData, goalRows, budgetCategories, monthTx, health, reminders] = await Promise.all([
    fetchAll(() => req.db.from('events').select('*').lte('event_date', today).or(`repeat.neq.none,event_date.eq.${today}`)),
    req.db.from('tasks').select('*').is('done_at', null).lte('due_date', addDays(today, 6)).order('due_date').order('created_at').then(must),
    req.db.from('tasks').select('*').gte('done_at', startOfDayUtc(addDays(today, -13), zone)).then(must),
    loadHabits(req, today),
    req.db.from('goals').select('*, goal_milestones(*)').neq('status', 'completed').order('deadline', { nullsFirst: false }).then(must),
    req.db.from('budget_categories').select('*').order('position').then(must),
    fetchAll(() => req.db.from('transactions').select('type, amount, budget_category_id').gte('tx_date', monthStart).lte('tx_date', monthEnd)),
    req.db.from('health_logs').select('*').eq('log_date', today).maybeSingle(),
    req.db.from('reminders').select('*').eq('done', false).order('due_date', { nullsFirst: false }).order('created_at').limit(6).then(must),
  ]);
  if (health.error) throw dbError(health.error);

  // ----- Schedule -----
  const schedule = events.filter((e) => occurrences(e, today, today).length).sort(byTime);

  // ----- Tasks: today's (done or not), the rest of the week, and overdue -----
  const doneToday = recentlyDone.filter((t) => t.due_date === today);
  const todayTasks = [...openTasks.filter((t) => t.due_date === today), ...doneToday]
    .sort((a, b) => Number(Boolean(b.done_at)) - Number(Boolean(a.done_at)) || a.created_at.localeCompare(b.created_at));
  const weekTasks = openTasks.filter((t) => t.due_date && t.due_date > today);
  const overdueTasks = openTasks.filter((t) => t.due_date && t.due_date < today);

  // ----- Habits (last 5 days) -----
  const board = habitBoard(habitData.habits, habitData.logs, today, 5, 1);

  // ----- Goals -----
  const goals = goalRows.map(withProgress);

  // ----- Budget: spent this month per category (savings included) -----
  /** @type {Record<string, number>} */
  const spentBy = {};
  for (const tx of monthTx) {
    if (tx.type === 'expense' && tx.budget_category_id) spentBy[tx.budget_category_id] = (spentBy[tx.budget_category_id] || 0) + Number(tx.amount);
  }
  const budgetItems = budgetCategories.map((c) => ({ id: c.id, name: c.name, color: c.color, icon: c.icon, limit: Number(c.monthly_limit), spent: spentBy[c.id] || 0 }));
  const budgetTotal = budgetItems.reduce((sum, c) => sum + c.limit, 0);
  const spentTotal = budgetItems.reduce((sum, c) => sum + c.spent, 0);

  // ----- Productivity: tasks finished per day, last 7 days vs the 7 before -----
  /** @type {Record<string, number>} */
  const doneByDay = {};
  for (const t of recentlyDone) {
    if (!t.done_at) continue;
    const day = dateIn(new Date(t.done_at), zone);
    doneByDay[day] = (doneByDay[day] || 0) + 1;
  }
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const before7 = Array.from({ length: 7 }, (_, i) => addDays(today, i - 13));
  const thisWeek = last7.reduce((sum, d) => sum + (doneByDay[d] || 0), 0);
  const lastWeek = before7.reduce((sum, d) => sum + (doneByDay[d] || 0), 0);

  res.json({
    today,
    name: profile.full_name,
    stats: {
      tasks: { done: todayTasks.filter((t) => t.done_at).length, total: todayTasks.length },
      goals: { on_track: goals.filter((g) => g.status === 'on-track').length, active: goals.length },
      streak: board.summary.best,
      wellness: health.data?.mood ?? null,
    },
    schedule,
    tasks: { today: todayTasks, week: weekTasks, overdue: overdueTasks },
    habits: { days: board.days, items: board.items, done_today: board.summary.done_today },
    goals: goals.slice(0, 5),
    budget: { month: today.slice(0, 7), total: budgetTotal, spent: spentTotal, categories: budgetItems },
    health: {
      steps: health.data?.steps ?? null,
      sleep_minutes: health.data?.sleep_minutes ?? null,
      resting_hr: health.data?.resting_hr ?? null,
      goals: { steps: profile.step_goal, sleep_minutes: profile.sleep_goal_minutes },
    },
    reminders,
    productivity: {
      days: last7.map((date) => ({ date, count: doneByDay[date] || 0 })),
      this_week: thisWeek,
      last_week: lastWeek,
      change: lastWeek ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : null,
    },
  });
});

module.exports = router;
