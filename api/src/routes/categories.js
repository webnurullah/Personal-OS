const { Router } = require('express');
const { z, s, parse, nonEmpty } = require('../lib/validate');
const { must } = require('../lib/http');

const router = Router();

const Create = z.object({
  name: s.text(40),
  color: s.color.optional(),
  position: z.number().int().min(0).optional(),
}).strict();
const Update = Create.partial().strict();

router.get('/', async (req, res) => {
  const items = must(await req.db.from('categories').select('*').order('position').order('created_at'));
  res.json({ items });
});

router.post('/', async (req, res) => {
  const body = parse(Create, req.body);
  if (body.position === undefined) {
    const { count } = await req.db.from('categories').select('id', { count: 'exact', head: true });
    body.position = count ?? 0;
  }
  res.status(201).json(must(await req.db.from('categories').insert(body).select().single()));
});

router.patch('/:id', async (req, res) => {
  const id = parse(s.id, req.params.id);
  const changes = nonEmpty(parse(Update, req.body));
  res.json(must(await req.db.from('categories').update(changes).eq('id', id).select().single()));
});

// Tasks, events and goals in this category keep existing, just without a category.
router.delete('/:id', async (req, res) => {
  const id = parse(s.id, req.params.id);
  must(await req.db.from('categories').delete().eq('id', id).select('id').single());
  res.json({ ok: true });
});

module.exports = router;
