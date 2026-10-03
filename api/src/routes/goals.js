const { Router } = require('express');
const { z, s, parse, nonEmpty } = require('../lib/validate');
const { must } = require('../lib/http');
const { todayFor } = require('../lib/profile');
const { withProgress } = require('../lib/goals');

const goals = Router();
const milestones = Router();

const Create = z.object({
  title: s.text(200),
  category_id: s.id.nullable().optional(),
  icon: s.icon.optional(),
  color: s.color.optional(),
  status: z.enum(['on-track', 'behind', 'completed']).optional(),
  progress_mode: z.enum(['value', 'milestones']).optional(),
  current_value: z.number().min(0).max(1e12).optional(),
  target_value: z.number().positive().max(1e12).optional(),
  unit: s.optionalText(20).optional(),
  deadline: s.date.nullable().optional(),
  note: s.optionalText(500).optional(),
}).strict();

const MilestoneCreate = z.object({
  title: s.text(200),
  at_value: z.number().min(0).nullable().optional(),
  done: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
}).strict();

goals.get('/', async (req, res) => {
  const today = await todayFor(req);
  const rows = must(await req.db.from('goals').select('*, goal_milestones(*)').order('deadline', { nullsFirst: false }).order('created_at'));
  const items = rows.map(withProgress);
  const active = items.filter((g) => g.status !== 'completed');
  res.json({
    today,
    items,
    summary: {
      active: active.length,
      on_track: active.filter((g) => g.status === 'on-track').length,
      behind: active.filter((g) => g.status === 'behind').length,
      average: active.length ? Math.round(active.reduce((sum, g) => sum + g.percent, 0) / active.length) : 0,
    },
  });
});

goals.post('/', async (req, res) => {
  const body = parse(Create, req.body);
  const goal = must(await req.db.from('goals').insert(body).select('*, goal_milestones(*)').single());
  res.status(201).json(withProgress(goal));
});

goals.patch('/:id', async (req, res) => {
  const id = parse(s.id, req.params.id);
  /** @type {import('../types/database').Database['public']['Tables']['goals']['Update']} */
  const changes = nonEmpty(parse(Create.partial().strict(), req.body));
  if (changes.status) changes.completed_on = changes.status === 'completed' ? await todayFor(req) : null;
  const goal = must(await req.db.from('goals').update(changes).eq('id', id).select('*, goal_milestones(*)').single());
  res.json(withProgress(goal));
});

goals.delete('/:id', async (req, res) => {
  const id = parse(s.id, req.params.id);
  must(await req.db.from('goals').delete().eq('id', id).select('id').single());
  res.json({ ok: true });
});

goals.post('/:id/milestones', async (req, res) => {
  const goalId = parse(s.id, req.params.id);
  const body = parse(MilestoneCreate, req.body);
  must(await req.db.from('goals').select('id').eq('id', goalId).single()); // the goal must be yours
  if (body.position === undefined) {
    const { count } = await req.db.from('goal_milestones').select('id', { count: 'exact', head: true }).eq('goal_id', goalId);
    body.position = count ?? 0;
  }
  res.status(201).json(must(await req.db.from('goal_milestones').insert({ ...body, goal_id: goalId }).select().single()));
});

milestones.patch('/:id', async (req, res) => {
  const id = parse(s.id, req.params.id);
  const changes = nonEmpty(parse(MilestoneCreate.partial().strict(), req.body));
  res.json(must(await req.db.from('goal_milestones').update(changes).eq('id', id).select().single()));
});

milestones.delete('/:id', async (req, res) => {
  const id = parse(s.id, req.params.id);
  must(await req.db.from('goal_milestones').delete().eq('id', id).select('id').single());
  res.json({ ok: true });
});

module.exports = { goals, milestones };
