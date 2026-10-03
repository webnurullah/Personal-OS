const { Router } = require('express');
const { z, s, parse, nonEmpty } = require('../lib/validate');
const { must, HttpError } = require('../lib/http');
const { todayFor } = require('../lib/profile');
const { mondayOf } = require('../lib/dates');
const { courseSummaries } = require('../lib/course');

const courses = Router();
const units = Router();
const topics = Router();

const CourseFields = z.object({
  title: s.text(300),
  subtitle: s.optionalText(120).optional(),
  quote: s.optionalText(200).optional(),
  start_date: s.date,
  target_date: s.date,
  weekly_plan: z.array(z.number().min(0).max(80)).max(156).optional(),
  color: s.color.optional(),
}).strict();

const UnitFields = z.object({
  code: s.text(10),
  title: s.optionalText(200).optional(),
  color: s.color.optional(),
  position: z.number().int().min(0).optional(),
}).strict();

const TopicFields = z.object({
  unit_id: s.id,
  code: s.text(10),
  title: s.text(300),
  short_title: s.optionalText(80).optional(),
  outcome: s.optionalText(300).optional(),
  est_hours: z.number().positive().max(500),
  planned_week: z.number().int().min(1).max(156).nullable().optional(),
  status: z.enum(['not-started', 'in-progress', 'done']).optional(),
  actual_hours: z.number().min(0).max(1000).optional(),
  notes: s.optionalText(300).optional(),
  position: z.number().int().min(0).optional(),
}).strict();

/**
 * @template {{ start_date?: string; target_date?: string }} T
 * @param {T} c
 * @returns {T}
 */
function checkDates(c) {
  if (c.start_date) c.start_date = mondayOf(c.start_date); // week 1 always starts on a Monday
  if (c.start_date && c.target_date && c.target_date <= c.start_date) throw new HttpError(400, 'The target date must be after the start date.');
  return c;
}

courses.get('/', async (req, res) => {
  const today = await todayFor(req);
  res.json({ today, items: await courseSummaries(req.db, today) });
});

courses.post('/', async (req, res) => {
  const body = checkDates(parse(CourseFields, req.body));
  res.status(201).json(must(await req.db.from('courses').insert(body).select().single()));
});

// One course with its units and topics. The web app works out the totals,
// so they update instantly while you type.
courses.get('/:id', async (req, res) => {
  const id = parse(s.id, req.params.id);
  const today = await todayFor(req);
  const course = must(await req.db.from('courses').select('*').eq('id', id).single());
  const [unitRows, topicRows] = await Promise.all([
    req.db.from('course_units').select('*').eq('course_id', id).order('position').order('code'),
    req.db.from('course_topics').select('*').eq('course_id', id).order('position').order('code'),
  ]);
  const allTopics = must(topicRows);
  res.json({
    today,
    course,
    units: must(unitRows).map((unit) => ({ ...unit, topics: allTopics.filter((t) => t.unit_id === unit.id) })),
  });
});

courses.patch('/:id', async (req, res) => {
  const id = parse(s.id, req.params.id);
  const changes = checkDates(nonEmpty(parse(CourseFields.partial().strict(), req.body)));
  res.json(must(await req.db.from('courses').update(changes).eq('id', id).select().single()));
});

courses.delete('/:id', async (req, res) => {
  const id = parse(s.id, req.params.id);
  must(await req.db.from('courses').delete().eq('id', id).select('id').single());
  res.json({ ok: true });
});

courses.post('/:id/units', async (req, res) => {
  const courseId = parse(s.id, req.params.id);
  const body = parse(UnitFields, req.body);
  must(await req.db.from('courses').select('id').eq('id', courseId).single()); // the course must be yours
  if (body.position === undefined) {
    const { count } = await req.db.from('course_units').select('id', { count: 'exact', head: true }).eq('course_id', courseId);
    body.position = count ?? 0;
  }
  res.status(201).json(must(await req.db.from('course_units').insert({ ...body, course_id: courseId }).select().single()));
});

courses.post('/:id/topics', async (req, res) => {
  const courseId = parse(s.id, req.params.id);
  const body = parse(TopicFields, req.body);
  // The unit must belong to this course (and to you).
  must(await req.db.from('course_units').select('id').eq('id', body.unit_id).eq('course_id', courseId).single());
  if (body.position === undefined) {
    const { count } = await req.db.from('course_topics').select('id', { count: 'exact', head: true }).eq('course_id', courseId);
    body.position = count ?? 0;
  }
  res.status(201).json(must(await req.db.from('course_topics').insert({ ...body, course_id: courseId }).select().single()));
});

units.patch('/:id', async (req, res) => {
  const id = parse(s.id, req.params.id);
  const changes = nonEmpty(parse(UnitFields.partial().strict(), req.body));
  res.json(must(await req.db.from('course_units').update(changes).eq('id', id).select().single()));
});

// Deleting a unit deletes its topics too.
units.delete('/:id', async (req, res) => {
  const id = parse(s.id, req.params.id);
  must(await req.db.from('course_units').delete().eq('id', id).select('id').single());
  res.json({ ok: true });
});

topics.patch('/:id', async (req, res) => {
  const id = parse(s.id, req.params.id);
  const changes = nonEmpty(parse(TopicFields.omit({ unit_id: true }).partial().strict(), req.body));
  res.json(must(await req.db.from('course_topics').update(changes).eq('id', id).select().single()));
});

topics.delete('/:id', async (req, res) => {
  const id = parse(s.id, req.params.id);
  must(await req.db.from('course_topics').delete().eq('id', id).select('id').single());
  res.json({ ok: true });
});

module.exports = { courses, units, topics };
