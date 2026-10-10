// What each endpoint accepts. Anything else is refused with a 400 and the field errors.
import { courseWeeks, MAX_COURSE_WEEKS } from "../course.ts";
import { readLink, tidyName, type LinkKind } from "../companies.ts";
import { GOAL_LINK_KINDS } from "../goal-link.ts";
import { isHttpUrl } from "../projects.ts";
import { daysBetween, mondayOf, weekdayIndex } from "./dates.ts";
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
  /** The project this task belongs to (null = none). */
  project_id: s.id.nullable().optional(),
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
  // A goal can follow a course (its hours) or the certificates you earn instead of a number typed by hand.
  link_kind: z.enum(GOAL_LINK_KINDS).nullable().optional(),
  course_id: s.id.nullable().optional(),
}).strict();

/** What a goal follows has to make sense: a course needs its course, nothing else has one, and it is measured in a number. */
export function checkGoalLink<T extends { link_kind?: string | null; course_id?: string | null; progress_mode?: string }>(goal: T): T {
  if (goal.link_kind === "course" && !goal.course_id) throw new HttpError(400, "Pick the course this goal follows.");
  if (goal.link_kind !== "course" && goal.course_id) throw new HttpError(400, "A course can only be chosen when the goal follows a course.");
  if (goal.link_kind && goal.progress_mode === "milestones") throw new HttpError(400, "A goal that follows a course or certificates is measured in a number, not milestones.");
  // Following nothing (or only the certificates) clears the course.
  if (goal.link_kind !== undefined && goal.link_kind !== "course") return { ...goal, course_id: null };
  return goal;
}

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
  // What it was about: a topic of one of your courses (its hours then add up there) and/or a library item.
  topic_id: s.id.nullable().optional(),
  resource_id: s.id.nullable().optional(),
}).strict();

// ---------- Companies ----------
const companyLink = (kind: LinkKind) =>
  z.string().max(600).transform((value, ctx) => {
    const read = readLink(kind, value);
    if ("problem" in read) {
      ctx.addIssue({ code: "custom", message: read.problem });
      return z.NEVER;
    }
    return read.link;
  });
export const CompanyFields = z.object({
  name: z.string().transform(tidyName).pipe(z.string().min(1, "Required").max(200)),
  website: companyLink("website").optional(),
  facebook: companyLink("facebook").optional(),
  linkedin: companyLink("linkedin").optional(),
  note: s.optionalText(1000).optional(),
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
  // The category is any words (up to 60 letters, spaces inside collapsed); the status is active, paused or done.
  category: s.optionalText(60).transform((v) => v.replace(/\s+/g, " ")).optional(),
  status: z.enum(["active", "paused", "done"]).optional(),
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
  /** How many of the three look-backs (after 1, 7 and 21 days) of a finished topic are done. */
  revision_step: z.number().int().min(0).max(3).optional(),
  status: z.enum(["not-started", "in-progress", "done"]).optional(),
  actual_hours: z.number().min(0).max(1000).optional(),
  notes: s.optionalText(300).optional(),
  position: z.number().int().min(0).optional(),
}).strict();

// A pasted outline (or a template), and planning the weeks of a course.
export const OutlineInput = z.object({
  text: z.string().max(30_000),
  default_hours: z.number().min(0.25).max(500).optional(),
  /** Also give the new topics their weeks (spread over the weeks left at `weekly_hours` a week). */
  plan: z.boolean().optional(),
  weekly_hours: z.number().min(0.5).max(100).optional(), // as many as the weekly study goal may be; a week is planned with at most 80
}).strict();
export const PlanInput = z.object({ mode: z.enum(["plan", "carry"]), weekly_hours: z.number().min(0.5).max(100).optional() }).strict();
/** Tasks for the topics of one week of a course (this week when `week` is left out). */
export const WeekTasksInput = z.object({ week: z.number().int().min(1).max(156).optional() }).strict();
/** A course for one missing skill (Job Apply): `by` is the last date among the jobs that ask for it. */
export const SkillCourseInput = z.object({ skill: s.text(60), by: s.date.optional(), jobs: z.array(s.text(200)).max(10).optional() }).strict();

/**
 * Week 1 always starts on a Monday, the target must come after the start, and a course lasts at most 3 years.
 * When a change sends only one of the two dates, `existing` (the saved course) supplies the other.
 */
export function checkDates<T extends { start_date?: string; target_date?: string }>(c: T, existing?: { start_date: string; target_date: string }): T {
  if (c.start_date) c.start_date = mondayOf(c.start_date);
  const start = c.start_date ?? existing?.start_date;
  const target = c.target_date ?? existing?.target_date;
  if (start && target) {
    if (target <= start) throw new HttpError(400, "The target date must be after the start date.");
    // 156 weeks at most (counting the target day itself: a course that ends on the last day of week 156 is allowed).
    if (daysBetween(start, target) + 1 > MAX_COURSE_WEEKS * 7) throw new HttpError(400, "A course can last at most 3 years. Check the target date.");
  }
  return c;
}

/** A topic can only be planned in a week the course has. */
export function checkPlannedWeek(week: number | null | undefined, course: { start_date: string; target_date: string }) {
  if (week == null) return;
  const weeks = courseWeeks({ ...course, weekly_plan: [] });
  if (week > weeks) throw new HttpError(400, `Week ${week} is after the end of the course. The course has ${weeks} ${weeks === 1 ? "week" : "weeks"}.`);
}

// ---------- Learning library (certificates & playlists) ----------
const link = z.string().trim().max(2000).refine((v) => v === "" || isHttpUrl(v), "Use a link starting with https://");

export const ResourceFields = z.object({
  course_id: s.id.nullable(),
  unit_id: s.id.nullable(),
  kind: z.enum(["certificate", "playlist", "video", "reading", "other"]),
  title: s.text(300),
  url: link,
  platform: s.optionalText(60),
  provider: s.optionalText(120),
  status: z.enum(["todo", "learning", "completed", "dropped"]),
  priority: z.enum(["low", "medium", "high"]),
  est_hours: z.number().min(0).max(1000),
  items_total: z.number().int().min(0).max(5000),
  items_done: z.number().int().min(0).max(5000),
  due_date: s.date.nullable(),
  started_on: s.date.nullable(),
  completed_on: s.date.nullable(),
  cost: z.number().min(0).max(10_000_000),
  skills: z.array(z.string().trim().min(1).max(60)).max(30),
  rating: z.number().int().min(1).max(5).nullable(),
  /** How many of the three look-backs (after 1, 7 and 21 days) of a finished item are done. */
  revision_step: z.number().int().min(0).max(3),
  takeaway: s.optionalText(300),
  dropped_reason: s.optionalText(300),
  notes: s.optionalText(2000),
  certificate_url: link,
  certificate_id: s.optionalText(120),
  issued_on: s.date.nullable(),
  expires_on: s.date.nullable(),
}).partial().strict();

/** A new item: the title is the only thing that must be there. */
export const ResourceCreate = ResourceFields.required({ title: true });

/** Many items at once (pasted list): a title or a link each, up to 50. */
export const ResourceBulk = z.object({
  course_id: s.id.nullable().optional(),
  kind: z.enum(["certificate", "playlist", "video", "reading", "other"]).optional(),
  items: z.array(z.object({
    title: s.optionalText(300),
    url: link,
    // From the starter ideas (each knows its kind, platform, length and skills).
    kind: z.enum(["certificate", "playlist", "video", "reading", "other"]).optional(),
    platform: s.optionalText(60).optional(),
    est_hours: z.number().min(0).max(1000).optional(),
    skills: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
  }).strict().refine((i) => i.title || i.url, "Each item needs a title or a link")).min(1).max(50),
}).strict();

/** Reading a link to fill the form. */
export const ResourceReadInput = z.object({ url: z.string().trim().min(1).max(2000) }).strict();

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

/** A new job: the title is the only thing that must be there. */
export const JobCreate = JobFields.required({ title: true });

// ---------- Projects ----------
export const ProjectLink = z.object({ label: s.text(60), url: z.url({ protocol: /^https?$/ }).max(500) }).strict();

export const ProjectFields = z.object({
  name: s.text(120),
  kind: z.enum(["website", "social", "brand", "other"]),
  status: z.enum(["active", "paused", "done"]),
  color: s.color,
  /** Who it is for (empty = your own project). */
  client: s.optionalText(120),
  goal: s.optionalText(300),
  /** Both optional: a project with no due date is ongoing. */
  start_date: s.date.nullable(),
  due_date: s.date.nullable(),
  links: z.array(ProjectLink).max(12),
  notes: s.optionalText(10000),
  /** true = move to the Archive, false = restore (the API sets or clears archived_at). */
  archived: z.boolean(),
}).partial().strict();

/** A new project: the name is the only thing that must be there. */
export const ProjectCreate = ProjectFields.omit({ archived: true }).required({ name: true });

/** The due date cannot come before the start date. */
export function checkProjectDates<T extends { start_date?: string | null; due_date?: string | null }>(p: T): T {
  if (p.start_date && p.due_date && p.due_date < p.start_date) throw new HttpError(400, "The due date cannot be before the start date.");
  return p;
}
