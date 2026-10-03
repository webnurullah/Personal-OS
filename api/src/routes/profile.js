const { Router } = require('express');
const { z, s, parse, nonEmpty } = require('../lib/validate');
const { must } = require('../lib/http');
const { getProfile, forgetProfile } = require('../lib/profile');
const { todayIn } = require('../lib/dates');

const router = Router();
const zones = new Set([...Intl.supportedValuesOf('timeZone'), 'UTC']);

const Notify = z.object({
  morning_plan: z.boolean(),
  habit_reminder: z.boolean(),
  bills_due: z.boolean(),
  study_sessions: z.boolean(),
  weekly_review: z.boolean(),
}).partial().strict();

const Update = z.object({
  full_name: s.optionalText(80),
  tagline: s.optionalText(120),
  city: s.optionalText(80),
  timezone: z.string().refine((zone) => zones.has(zone), 'Unknown time zone'),
  currency: z.enum(['BDT', 'USD']),
  week_start: z.number().int().min(0).max(6),
  time_format: z.enum(['12h', '24h']),
  hide_amounts: z.boolean(),
  weekly_study_goal: z.number().positive().max(100),
  step_goal: z.number().int().positive().max(100000),
  sleep_goal_minutes: z.number().int().min(60).max(960),
  water_goal: z.number().int().min(1).max(30),
  notify: Notify,
}).partial().strict();

/** @param {import('express').Request} req @param {import('../types/database').Database['public']['Tables']['profiles']['Row']} profile */
const present = (req, profile) => ({ ...profile, email: req.user.email, today: todayIn(profile.timezone) });

router.get('/', async (req, res) => {
  res.json(present(req, await getProfile(req)));
});

router.patch('/', async (req, res) => {
  const { notify, ...rest } = nonEmpty(parse(Update, req.body));
  /** @type {import('../types/database').Database['public']['Tables']['profiles']['Update']} */
  const changes = { ...rest };
  if (notify) {
    const current = /** @type {Record<string, boolean>} */ ((await getProfile(req)).notify);
    changes.notify = { ...current, ...notify };
  }
  const profile = must(await req.db.from('profiles').update(changes).eq('id', req.user.id).select().single());
  forgetProfile(req.user.id);
  res.json(present(req, profile));
});

module.exports = router;
