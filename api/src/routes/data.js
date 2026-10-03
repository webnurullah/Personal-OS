const { Router } = require('express');
const { z, parse } = require('../lib/validate');
const { must } = require('../lib/http');
const { getProfile, forgetProfile, todayFor } = require('../lib/profile');
const { fetchAll } = require('../lib/paging');

const router = Router();

const TABLES = /** @type {const} */ ([
  'categories', 'tasks', 'events', 'goals', 'goal_milestones', 'habits', 'habit_logs', 'study_weeks', 'study_blocks',
  'courses', 'course_units', 'course_topics', 'budget_categories', 'transactions', 'bills', 'health_logs', 'notes', 'reminders',
]);

// Download everything as one JSON file.
router.get('/export', async (req, res) => {
  const today = await todayFor(req);
  /** @type {Record<string, unknown>} */
  const out = { exported_at: new Date().toISOString(), profile: await getProfile(req) };
  for (const table of TABLES) out[table] = await fetchAll(() => req.db.from(table).select('*'));
  res.attachment(`nurullah-pos-export-${today}.json`);
  res.json(out);
});

// Fill an empty account with the template's sample data.
router.post('/sample-data', async (req, res) => {
  must(await req.db.rpc('load_sample_data', { p_today: await todayFor(req) }));
  res.status(201).json({ ok: true });
});

// Delete every task, note, transaction … (the account and profile stay).
router.post('/delete-all', async (req, res) => {
  parse(z.object({ confirm: z.literal('DELETE', { message: 'Type DELETE to confirm' }) }).strict(), req.body);
  must(await req.db.rpc('delete_my_data'));
  forgetProfile(req.user.id);
  res.json({ ok: true });
});

module.exports = router;
