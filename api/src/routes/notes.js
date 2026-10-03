const { Router } = require('express');
const { z, s, parse, nonEmpty } = require('../lib/validate');
const { must } = require('../lib/http');
const { todayFor } = require('../lib/profile');

const notes = Router();
const reminders = Router();

const NoteFields = z.object({
  title: s.text(200),
  body: s.optionalText(10000).optional(),
  tag: s.optionalText(30).optional(),
  color: s.color.optional(),
  pinned: z.boolean().optional(),
}).strict();

const ReminderFields = z.object({
  text: s.text(200),
  due_date: s.date.nullable().optional(),
  done: z.boolean().optional(),
}).strict();

notes.get('/', async (req, res) => {
  const items = must(await req.db.from('notes').select('*').order('pinned', { ascending: false }).order('updated_at', { ascending: false }));
  res.json({ today: await todayFor(req), items });
});

notes.post('/', async (req, res) => {
  const body = parse(NoteFields, req.body);
  res.status(201).json(must(await req.db.from('notes').insert(body).select().single()));
});

notes.patch('/:id', async (req, res) => {
  const id = parse(s.id, req.params.id);
  const changes = nonEmpty(parse(NoteFields.partial().strict(), req.body));
  res.json(must(await req.db.from('notes').update(changes).eq('id', id).select().single()));
});

notes.delete('/:id', async (req, res) => {
  const id = parse(s.id, req.params.id);
  must(await req.db.from('notes').delete().eq('id', id).select('id').single());
  res.json({ ok: true });
});

// Open reminders, plus ticked ones added in the last 30 days.
reminders.get('/', async (req, res) => {
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const items = must(
    await req.db.from('reminders').select('*')
      .or(`done.eq.false,created_at.gte."${since}"`)
      .order('done')
      .order('due_date', { nullsFirst: false })
      .order('created_at'),
  );
  res.json({ today: await todayFor(req), items });
});

reminders.post('/', async (req, res) => {
  const body = parse(ReminderFields, req.body);
  res.status(201).json(must(await req.db.from('reminders').insert(body).select().single()));
});

reminders.patch('/:id', async (req, res) => {
  const id = parse(s.id, req.params.id);
  const changes = nonEmpty(parse(ReminderFields.partial().strict(), req.body));
  res.json(must(await req.db.from('reminders').update(changes).eq('id', id).select().single()));
});

reminders.delete('/:id', async (req, res) => {
  const id = parse(s.id, req.params.id);
  must(await req.db.from('reminders').delete().eq('id', id).select('id').single());
  res.json({ ok: true });
});

module.exports = { notes, reminders };
