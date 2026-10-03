const { Router } = require('express');
const { z, s, parse, nonEmpty } = require('../lib/validate');
const { must, dbError } = require('../lib/http');
const { getProfile, todayFor } = require('../lib/profile');
const { mondayOf, weekdayIndex } = require('../lib/dates');
const { courseSummaries } = require('../lib/course');

const router = Router();

const monday = s.date.refine((d) => weekdayIndex(d) === 0, 'The week must start on a Monday');

const BlockCreate = z.object({
  week_start: monday,
  weekday: z.number().int().min(0).max(6),
  hours: z.number().positive().max(24),
  activity: s.text(200),
  done: z.boolean().optional(),
}).strict();

// One study week: its topic, goal, planned blocks, and a summary of every course.
router.get('/week', async (req, res) => {
  const today = await todayFor(req);
  const { start } = parse(z.object({ start: s.date.optional() }), req.query);
  const weekStart = mondayOf(start || today);
  const [week, blocks, courses, profile] = await Promise.all([
    req.db.from('study_weeks').select('*').eq('week_start', weekStart).maybeSingle(),
    req.db.from('study_blocks').select('*').eq('week_start', weekStart).order('weekday').order('created_at'),
    courseSummaries(req.db, today),
    getProfile(req),
  ]);
  if (week.error) throw dbError(week.error);
  res.json({
    today,
    week_start: weekStart,
    topic: week.data?.topic ?? '',
    goal_hours: Number(week.data?.goal_hours ?? profile.weekly_study_goal),
    blocks: must(blocks),
    courses,
  });
});

// Set this week's topic or goal (creates the week row if needed).
router.put('/week/:start', async (req, res) => {
  const weekStart = parse(monday, req.params.start);
  const changes = nonEmpty(parse(z.object({ topic: s.optionalText(120), goal_hours: z.number().positive().max(100) }).partial().strict(), req.body));
  const row = must(
    await req.db.from('study_weeks')
      .upsert({ ...changes, user_id: req.user.id, week_start: weekStart }, { onConflict: 'user_id,week_start' })
      .select().single(),
  );
  res.json(row);
});

router.post('/blocks', async (req, res) => {
  const body = parse(BlockCreate, req.body);
  res.status(201).json(must(await req.db.from('study_blocks').insert(body).select().single()));
});

router.patch('/blocks/:id', async (req, res) => {
  const id = parse(s.id, req.params.id);
  const changes = nonEmpty(parse(BlockCreate.omit({ week_start: true }).partial().strict(), req.body));
  res.json(must(await req.db.from('study_blocks').update(changes).eq('id', id).select().single()));
});

router.delete('/blocks/:id', async (req, res) => {
  const id = parse(s.id, req.params.id);
  must(await req.db.from('study_blocks').delete().eq('id', id).select('id').single());
  res.json({ ok: true });
});

module.exports = router;
