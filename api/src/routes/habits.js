const { Router } = require('express');
const { z, s, parse, nonEmpty } = require('../lib/validate');
const { must, HttpError } = require('../lib/http');
const { todayFor } = require('../lib/profile');
const { addDays } = require('../lib/dates');
const { fetchAll } = require('../lib/paging');
const { habitBoard } = require('../lib/habits');

const router = Router();

const Create = z.object({
  name: s.text(80),
  goal_text: s.optionalText(80).optional(),
  icon: s.icon.optional(),
  color: s.color.optional(),
  position: z.number().int().min(0).optional(),
}).strict();

/**
 * Active habits with their done days. Streaks look back up to 400 days.
 * @param {import('express').Request} req
 * @param {string} today
 */
async function loadHabits(req, today) {
  const [habits, logs] = await Promise.all([
    req.db.from('habits').select('*').is('archived_at', null).order('position').order('created_at').then(must),
    fetchAll(() => req.db.from('habit_logs').select('habit_id, log_date').gte('log_date', addDays(today, -400)).order('log_date')),
  ]);
  return { habits, logs };
}

router.get('/', async (req, res) => {
  const today = await todayFor(req);
  const { days } = parse(z.object({ days: z.coerce.number().int().min(1).max(14).optional() }), req.query);
  const { habits, logs } = await loadHabits(req, today);
  res.json({ today, ...habitBoard(habits, logs, today, days || 7) });
});

router.post('/', async (req, res) => {
  const body = parse(Create, req.body);
  if (body.position === undefined) {
    const { count } = await req.db.from('habits').select('id', { count: 'exact', head: true });
    body.position = count ?? 0;
  }
  res.status(201).json(must(await req.db.from('habits').insert(body).select().single()));
});

router.patch('/:id', async (req, res) => {
  const id = parse(s.id, req.params.id);
  const { archived, ...rest } = nonEmpty(parse(Create.partial().extend({ archived: z.boolean().optional() }).strict(), req.body));
  /** @type {import('../types/database').Database['public']['Tables']['habits']['Update']} */
  const changes = { ...rest };
  if (archived !== undefined) changes.archived_at = archived ? new Date().toISOString() : null;
  res.json(must(await req.db.from('habits').update(changes).eq('id', id).select().single()));
});

router.delete('/:id', async (req, res) => {
  const id = parse(s.id, req.params.id);
  must(await req.db.from('habits').delete().eq('id', id).select('id').single());
  res.json({ ok: true });
});

/** Shared checks for ticking or unticking a day. @param {import('express').Request} req */
async function logTarget(req) {
  const id = parse(s.id, req.params.id);
  const date = parse(s.date, req.params.date);
  if (date > (await todayFor(req))) throw new HttpError(400, 'You cannot tick a day in the future.');
  must(await req.db.from('habits').select('id').eq('id', id).single()); // the habit must be yours
  return { id, date };
}

// Tick a day.
router.put('/:id/logs/:date', async (req, res) => {
  const { id, date } = await logTarget(req);
  must(await req.db.from('habit_logs').upsert({ habit_id: id, log_date: date, user_id: req.user.id }, { onConflict: 'habit_id,log_date', ignoreDuplicates: true }));
  res.json({ ok: true, done: true });
});

// Untick a day.
router.delete('/:id/logs/:date', async (req, res) => {
  const { id, date } = await logTarget(req);
  must(await req.db.from('habit_logs').delete().eq('habit_id', id).eq('log_date', date));
  res.json({ ok: true, done: false });
});

module.exports = { router, loadHabits };
