// What each endpoint accepts. Anything else is refused with a 400 and the field errors.
import { mondayOf, weekdayIndex } from "./dates.ts";
import { HttpError } from "./http.ts";
import { s, z } from "./validate.ts";

// ---------- Profile ----------
const zones = new Set([...Intl.supportedValuesOf("timeZone"), "UTC"]);

export const ProfileUpdate = z.object({
  full_name: s.optionalText(80),
  tagline: s.optionalText(120),
  city: s.optionalText(80),
  timezone: z.string().refine((zone) => zones.has(zone), "Unknown time zone"),
  currency: z.enum(["BDT", "USD"]),
  week_start: z.number().int().min(0).max(6),
  time_format: z.enum(["12h", "24h"]),
  hide_amounts: z.boolean(),
  weekly_study_goal: z.number().positive().max(100),
  step_goal: z.number().int().positive().max(100000),
  sleep_goal_minutes: z.number().int().min(60).max(960),
  water_goal: z.number().int().min(1).max(30),
  /** The skills you already have (Applications → Job Apply compares jobs with these). */
  skills: z.array(z.string().trim().min(1).max(60)).max(200),
  notify: z.object({
    morning_plan: z.boolean(),
    habit_reminder: z.boolean(),
    bills_due: z.boolean(),
    study_sessions: z.boolean(),
    weekly_review: z.boolean(),
  }).partial().strict(),
}).partial().strict();

// ---------- Categories (tasks, events, goals) ----------
export const CategoryCreate = z.object({
  name: s.text(40),
  color: s.color.optional(),
  position: z.number().int().min(0).optional(),
}).strict();

// ---------- Tasks ----------
export const TaskCreate = z.object({
  title: s.text(200),
  category_id: s.id.nullable().optional(),
  due_date: s.date.nullable().optional(),
  /** Optional last day, for tasks that run over several days. */
  end_date: s.date.nullable().optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  notes: s.optionalText(2000).optional(),
}).strict();
export const TaskUpdate = TaskCreate.partial().extend({ done: z.boolean().optional() }).strict();

/** An end date needs a due date, and cannot come before it. */
export function checkTaskDates<T extends { due_date?: string | null; end_date?: string | null }>(t: T): T {
  if (!t.end_date || !("due_date" in t)) return t;
  if (!t.due_date) throw new HttpError(400, "Add a due date before the end date.");
  if (t.end_date < t.due_date) throw new HttpError(400, "The end date cannot be before the due date.");
  return t;
}

// ---------- Events ----------
export const EventFields = z.object({
  title: s.text(200),
  event_date: s.date,
  all_day: z.boolean().optional(),
  start_time: s.time.nullable().optional(),
  end_time: s.time.nullable().optional(),
  repeat: z.enum(["none", "daily", "weekly"]).optional(),
  repeat_until: s.date.nullable().optional(),
  category_id: s.id.nullable().optional(),
  note: s.optionalText(300).optional(),
}).strict();

/** All-day events have no times; timed events must end after they start. */
export function checkTimes<T extends { all_day?: boolean; start_time?: string | null; end_time?: string | null }>(e: T): T {
  if (e.all_day) return { ...e, start_time: null, end_time: null };
  if (e.start_time && e.end_time && e.end_time <= e.start_time) throw new HttpError(400, "The end time must be after the start time.");
  return e;
}

// ---------- Goals ----------
export const GoalCreate = z.object({
  title: s.text(200),
  category_id: s.id.nullable().optional(),
  icon: s.icon.optional(),
  color: s.color.optional(),
  status: z.enum(["on-track", "behind", "completed"]).optional(),
  progress_mode: z.enum(["value", "milestones"]).optional(),
  current_value: z.number().min(0).max(1e12).optional(),
  target_value: z.number().positive().max(1e12).optional(),
  unit: s.optionalText(20).optional(),
  deadline: s.date.nullable().optional(),
  note: s.optionalText(500).optional(),
}).strict();

export const MilestoneCreate = z.object({
  title: s.text(200),
  at_value: z.number().min(0).nullable().optional(),
  done: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
}).strict();

// ---------- Habits ----------
export const HabitCreate = z.object({
  name: s.text(80),
  goal_text: s.optionalText(80).optional(),
  icon: s.icon.optional(),
  color: s.color.optional(),
  position: z.number().int().min(0).optional(),
}).strict();
export const HabitUpdate = HabitCreate.partial().extend({ archived: z.boolean().optional() }).strict();

// ---------- Learning ----------
export const monday = s.date.refine((d) => weekdayIndex(d) === 0, "The week must start on a Monday");

export const WeekUpdate = z.object({ topic: s.optionalText(120), goal_hours: z.number().positive().max(100) }).partial().strict();

export const BlockCreate = z.object({
  week_start: monday,
  weekday: z.number().int().min(0).max(6),
  hours: z.number().positive().max(24),
  activity: s.text(200),
  done: z.boolean().optional(),
}).strict();

// ---------- Courses ----------
export const CourseFields = z.object({
  title: s.text(300),
  subtitle: s.optionalText(120).optional(),
  quote: s.optionalText(200).optional(),
  start_date: s.date,
  target_date: s.date,
  weekly_plan: z.array(z.number().min(0).max(80)).max(156).optional(),
  color: s.color.optional(),
}).strict();

export const UnitFields = z.object({
  code: s.text(10),
  title: s.optionalText(200).optional(),
  color: s.color.optional(),
  position: z.number().int().min(0).optional(),
}).strict();

export const TopicFields = z.object({
  unit_id: s.id,
  code: s.text(10),
  title: s.text(300),
  short_title: s.optionalText(80).optional(),
  outcome: s.optionalText(300).optional(),
  est_hours: z.number().positive().max(500),
  planned_week: z.number().int().min(1).max(156).nullable().optional(),
  status: z.enum(["not-started", "in-progress", "done"]).optional(),
  actual_hours: z.number().min(0).max(1000).optional(),
  notes: s.optionalText(300).optional(),
  position: z.number().int().min(0).optional(),
}).strict();

/** Week 1 always starts on a Monday, and the target must come after the start. */
export function checkDates<T extends { start_date?: string; target_date?: string }>(c: T): T {
  if (c.start_date) c.start_date = mondayOf(c.start_date);
  if (c.start_date && c.target_date && c.target_date <= c.start_date) throw new HttpError(400, "The target date must be after the start date.");
  return c;
}

// ---------- Finance ----------
export const METHODS = ["bKash", "Nagad", "Card", "Cash", "Bank", "Other"] as const;

export const TxFields = z.object({
  type: z.enum(["income", "expense"]),
  amount: s.money,
  budget_category_id: s.id.nullable().optional(),
  description: s.text(200),
  note: s.optionalText(200).optional(),
  method: z.enum(METHODS),
  tx_date: s.date,
}).strict();

/** Income has no budget category. */
export function tidy<T extends { type?: string; budget_category_id?: string | null }>(tx: T): T {
  if (tx.type === "income") tx.budget_category_id = null;
  return tx;
}

export const BudgetCategoryFields = z.object({
  name: s.text(40),
  color: s.color.optional(),
  icon: s.icon.optional(),
  monthly_limit: z.number().min(0).max(1e10),
  is_savings: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
}).strict();

export const BillFields = z.object({
  name: s.text(120),
  note: s.optionalText(120).optional(),
  amount: s.money,
  budget_category_id: s.id.nullable().optional(),
  icon: s.icon.optional(),
  due_date: s.date,
  repeats_monthly: z.boolean().optional(),
}).strict();

// ---------- Health ----------
export const HealthFields = z.object({
  steps: z.number().int().min(0).max(200000).nullable(),
  sleep_minutes: z.number().int().min(0).max(1440).nullable(),
  resting_hr: z.number().int().min(20).max(250).nullable(),
  weight_kg: z.number().positive().max(500).nullable(),
  water_glasses: z.number().int().min(0).max(50),
  mood: z.number().int().min(1).max(10).nullable(),
}).partial().strict();

// ---------- Notes & reminders ----------
export const NoteFields = z.object({
  title: s.text(200),
  body: s.optionalText(10000).optional(),
  tag: s.optionalText(30).optional(),
  color: s.color.optional(),
  pinned: z.boolean().optional(),
}).strict();

export const ReminderFields = z.object({
  text: s.text(200),
  due_date: s.date.nullable().optional(),
  done: z.boolean().optional(),
}).strict();

// ---------- Applications: Job Apply ----------
export const JOB_STATUSES = ["saved", "applied", "interview", "offer", "rejected"] as const;

/** Add a job: a link to the post, its text (when the site cannot be read), or both. */
export const JobAdd = z.object({
  url: z.url({ protocol: /^https?$/, message: "Use a full link starting with https://" }).max(2000).optional(),
  text: s.optionalText(30000).optional(),
}).strict().refine((j) => j.url || j.text, "Add a link or paste the job post.");

export const JobFields = z.object({
  url: z.union([z.url({ protocol: /^https?$/ }).max(2000), z.literal("")]),
  title: s.text(200),
  company: s.optionalText(200),
  location: s.optionalText(200),
  deadline: s.date.nullable(),
  status: z.enum(JOB_STATUSES),
  applied_on: s.date.nullable(),
  summary: s.optionalText(2000),
  requirements: z.array(z.string().trim().min(1).max(500)).max(60),
  skills: z.array(z.string().trim().min(1).max(60)).max(60),
  notes: s.optionalText(5000),
}).partial().strict();
