const { Router } = require('express');
const { z, s, parse, nonEmpty } = require('../lib/validate');
const { must, HttpError } = require('../lib/http');
const { getProfile, todayFor } = require('../lib/profile');
const { addDays } = require('../lib/dates');

const router = Router();

const Fields = z.object({
  steps: z.number().int().min(0).max(200000).nullable(),
  sleep_minutes: z.number().int().min(0).max(1440).nullable(),
  resting_hr: z.number().int().min(20).max(250).nullable(),
  weight_kg: z.number().positive().max(500).nullable(),
  water_glasses: z.number().int().min(0).max(50),
  mood: z.number().int().min(1).max(10).nullable(),
}).partial().strict();

// The last N days of health logs (oldest first) and your goals.
router.get('/', async (req, res) => {
  const profile = await getProfile(req);
  const today = await todayFor(req);
  const { days = 30 } = parse(z.object({ days: z.coerce.number().int().min(1).max(366).optional() }), req.query);
  const logs = must(await req.db.from('health_logs').select('*').gte('log_date', addDays(today, -(days - 1))).lte('log_date', today).order('log_date'));
  res.json({
    today,
    goals: { steps: profile.step_goal, sleep_minutes: profile.sleep_goal_minutes, water: profile.water_goal },
    logs,
  });
});

// Save one day (only the fields you send change).
router.put('/:date', async (req, res) => {
  const date = parse(s.date, req.params.date);
  if (date > (await todayFor(req))) throw new HttpError(400, 'You cannot log a day in the future.');
  const changes = nonEmpty(parse(Fields, req.body));
  const row = must(
    await req.db.from('health_logs')
      .upsert({ ...changes, user_id: req.user.id, log_date: date }, { onConflict: 'user_id,log_date' })
      .select().single(),
  );
  res.json(row);
});

module.exports = router;
