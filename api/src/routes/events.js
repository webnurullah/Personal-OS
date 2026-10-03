const { Router } = require('express');
const { z, s, parse, nonEmpty } = require('../lib/validate');
const { must, HttpError } = require('../lib/http');
const { todayFor } = require('../lib/profile');
const { addDays, daysBetween } = require('../lib/dates');
const { fetchAll } = require('../lib/paging');
const { occurrences, byTime } = require('../lib/recurrence');

const router = Router();

const Fields = z.object({
  title: s.text(200),
  event_date: s.date,
  all_day: z.boolean().optional(),
  start_time: s.time.nullable().optional(),
  end_time: s.time.nullable().optional(),
  repeat: z.enum(['none', 'daily', 'weekly']).optional(),
  repeat_until: s.date.nullable().optional(),
  category_id: s.id.nullable().optional(),
  note: s.optionalText(300).optional(),
}).strict();

/**
 * All-day events have no times; timed events must end after they start.
 * @template {{ all_day?: boolean; start_time?: string | null; end_time?: string | null }} T
 * @param {T} e
 * @returns {T}
 */
function checkTimes(e) {
  if (e.all_day) return { ...e, start_time: null, end_time: null };
  if (e.start_time && e.end_time && e.end_time <= e.start_time) throw new HttpError(400, 'The end time must be after the start time.');
  return e;
}

// Every day an event happens between ?from and ?to (repeating events expanded).
router.get('/', async (req, res) => {
  const today = await todayFor(req);
  const query = parse(z.object({ from: s.date, to: s.date }).partial(), req.query);
  const from = query.from || today;
  const to = query.to || addDays(from, 41);
  const span = daysBetween(from, to);
  if (span < 0 || span > 93) throw new HttpError(400, 'Ask for at most three months at a time.');

  /** @type {import('../types/database').Database['public']['Tables']['events']['Row'][]} */
  const events = await fetchAll(() =>
    req.db.from('events').select('*')
      .lte('event_date', to)
      .or(`repeat.neq.none,event_date.gte.${from}`) // skip old one-off events
      .order('event_date'),
  );
  const items = events
    .flatMap((event) => occurrences(event, from, to).map((date) => ({ ...event, date })))
    .sort((a, b) => a.date.localeCompare(b.date) || byTime(a, b));
  res.json({ today, from, to, items });
});

router.post('/', async (req, res) => {
  const body = checkTimes(parse(Fields, req.body));
  if (!body.all_day && (!body.start_time || !body.end_time)) throw new HttpError(400, 'Add a start and end time, or make it an all-day event.');
  res.status(201).json(must(await req.db.from('events').insert(body).select().single()));
});

// Changes apply to the whole series of a repeating event.
router.patch('/:id', async (req, res) => {
  const id = parse(s.id, req.params.id);
  const changes = checkTimes(nonEmpty(parse(Fields.partial().strict(), req.body)));
  res.json(must(await req.db.from('events').update(changes).eq('id', id).select().single()));
});

router.delete('/:id', async (req, res) => {
  const id = parse(s.id, req.params.id);
  must(await req.db.from('events').delete().eq('id', id).select('id').single());
  res.json({ ok: true });
});

module.exports = router;
