const { Router } = require('express');
const { z, parse } = require('../lib/validate');
const { must } = require('../lib/http');

const router = Router();

// Ctrl+K search across your data. Returns at most 5 matches of each kind.
router.get('/', async (req, res) => {
  const { q = '' } = parse(z.object({ q: z.string().max(80).optional() }), req.query);
  // Characters with a meaning in Supabase filters are turned into spaces.
  const term = q.replace(/[%_,()*\\"]/g, ' ').trim();
  if (term.length < 2) return void res.json({ items: [] });
  const like = `%${term}%`;
  const db = req.db;

  const [tasks, notes, goals, events, habits, courses, transactions] = await Promise.all([
    db.from('tasks').select('id, title, due_date, done_at').ilike('title', like).order('created_at', { ascending: false }).limit(5).then(must),
    db.from('notes').select('id, title, tag').or(`title.ilike.${like},body.ilike.${like}`).limit(5).then(must),
    db.from('goals').select('id, title, status').ilike('title', like).limit(5).then(must),
    db.from('events').select('id, title, event_date').ilike('title', like).order('event_date', { ascending: false }).limit(5).then(must),
    db.from('habits').select('id, name').ilike('name', like).is('archived_at', null).limit(5).then(must),
    db.from('courses').select('id, title').ilike('title', like).limit(5).then(must),
    db.from('transactions').select('id, description, amount, tx_date').ilike('description', like).order('tx_date', { ascending: false }).limit(5).then(must),
  ]);

  res.json({
    items: [
      ...tasks.map((t) => ({ type: 'Task', id: t.id, title: t.title, hint: t.done_at ? 'Done' : t.due_date || 'No date', href: '/tasks' })),
      ...notes.map((n) => ({ type: 'Note', id: n.id, title: n.title, hint: n.tag, href: '/notes' })),
      ...goals.map((g) => ({ type: 'Goal', id: g.id, title: g.title, hint: g.status.replace('-', ' '), href: '/goals' })),
      ...events.map((e) => ({ type: 'Event', id: e.id, title: e.title, hint: e.event_date, href: `/calendar?date=${e.event_date}` })),
      ...habits.map((h) => ({ type: 'Habit', id: h.id, title: h.name, hint: 'Habit', href: '/habits' })),
      ...courses.map((c) => ({ type: 'Course', id: c.id, title: c.title, hint: 'Course', href: `/learning/${c.id}` })),
      ...transactions.map((t) => ({ type: 'Transaction', id: t.id, title: t.description, hint: t.tx_date, href: `/finance?month=${t.tx_date.slice(0, 7)}` })),
    ],
  });
});

module.exports = router;
