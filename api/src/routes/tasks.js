const { Router } = require('express');
const { z, s, parse, nonEmpty } = require('../lib/validate');
const { must } = require('../lib/http');
const { todayFor } = require('../lib/profile');

const router = Router();

const Create = z.object({
  title: s.text(200),
  category_id: s.id.nullable().optional(),
  due_date: s.date.nullable().optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  notes: s.optionalText(2000).optional(),
}).strict();
const Update = Create.partial().extend({ done: z.boolean().optional() }).strict();

// Open tasks, plus tasks finished in the last 14 days.
router.get('/', async (req, res) => {
  const today = await todayFor(req);
  const since = new Date(Date.now() - 14 * 86400000).toISOString();
  const items = must(
    await req.db.from('tasks').select('*')
      .or(`done_at.is.null,done_at.gte."${since}"`)
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('created_at'),
  );
  res.json({ today, items });
});

router.post('/', async (req, res) => {
  const body = parse(Create, req.body);
  res.status(201).json(must(await req.db.from('tasks').insert(body).select().single()));
});

router.patch('/:id', async (req, res) => {
  const id = parse(s.id, req.params.id);
  const { done, ...rest } = nonEmpty(parse(Update, req.body));
  /** @type {import('../types/database').Database['public']['Tables']['tasks']['Update']} */
  const changes = { ...rest };
  if (done !== undefined) changes.done_at = done ? new Date().toISOString() : null;
  res.json(must(await req.db.from('tasks').update(changes).eq('id', id).select().single()));
});

router.delete('/:id', async (req, res) => {
  const id = parse(s.id, req.params.id);
  must(await req.db.from('tasks').delete().eq('id', id).select('id').single());
  res.json({ ok: true });
});

module.exports = router;
