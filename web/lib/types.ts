// The shapes of the API's answers (see api/src/routes).
import type { Timeframe } from "./projects";

export type ColorName =
  | "white" | "slate" | "blue" | "sky" | "cyan" | "teal" | "emerald" | "lime"
  | "yellow" | "amber" | "orange" | "rose" | "pink" | "violet" | "indigo";
export type Currency = "BDT" | "USD";
export type TimeFormat = "12h" | "24h";
export type NotifyKey = "morning_plan" | "habit_reminder" | "bills_due" | "study_sessions" | "weekly_review";

export type Profile = {
  id: string;
  email: string;
  today: string;
  full_name: string;
  tagline: string;
  city: string;
  /** Link to your profile photo; null until you upload one (older cached answers may not have it). */
  avatar_url?: string | null;
  timezone: string;
  currency: Currency;
  week_start: number;
  time_format: TimeFormat;
  hide_amounts: boolean;
  weekly_study_goal: number;
  step_goal: number;
  sleep_goal_minutes: number;
  water_goal: number;
  notify: Record<NotifyKey, boolean>;
  notifications_read_at: string | null;
  skills: string[];
};

export type Category = { id: string; name: string; color: ColorName; position: number };

export type Priority = "low" | "medium" | "high";
export type Task = {
  id: string;
  title: string;
  category_id: string | null;
  /** The project this task belongs to (older cached answers may not have it). */
  project_id?: string | null;
  due_date: string | null;
  /** Last day of a task that runs over several days (null = one day). */
  end_date: string | null;
  priority: Priority;
  notes: string;
  done_at: string | null;
  created_at: string;
};

export type Repeat = "none" | "daily" | "weekly";
export type CalendarEvent = {
  id: string;
  title: string;
  event_date: string;
  all_day: boolean;
  start_time: string | null;
  end_time: string | null;
  repeat: Repeat;
  repeat_until: string | null;
  category_id: string | null;
  note: string;
  /** The day this occurrence happens (repeating events appear once per day). */
  date: string;
};

export type GoalStatus = "on-track" | "behind" | "completed";
export type Milestone = { id: string; goal_id: string; title: string; at_value: number | null; done: boolean; position: number };
export type Goal = {
  id: string;
  title: string;
  category_id: string | null;
  icon: string;
  color: ColorName;
  status: GoalStatus;
  progress_mode: "value" | "milestones";
  current_value: number;
  target_value: number;
  unit: string;
  deadline: string | null;
  note: string;
  completed_on: string | null;
  milestones: Milestone[];
  percent: number;
};

export type Habit = {
  id: string;
  name: string;
  goal_text: string;
  icon: string;
  color: ColorName;
  position: number;
  /** Done or not for each day in `days` (oldest first, today last). */
  done: boolean[];
  streak: number;
  share: number;
};

export type HabitsResponse = {
  today: string;
  days: string[];
  items: Habit[];
  heatmap: { date: string; share: number | null }[];
  summary: {
    total: number;
    done_today: number;
    best: { days: number; name: string };
    share: number;
    perfect_days: number;
    most_consistent: { name: string; share: number } | null;
    needs_attention: { name: string; share: number } | null;
  };
};

export type StudyBlock = { id: string; week_start: string; weekday: number; hours: number; activity: string; done: boolean; created_at: string };

export type CourseSummary = {
  id: string;
  title: string;
  subtitle: string;
  start_date: string;
  target_date: string;
  color: ColorName;
  est_hours: number;
  done_hours: number;
  spent_hours: number;
  percent: number;
  topic_count: number;
  unit_count: number;
  days_left: number;
};

export type LearningWeek = {
  today: string;
  week_start: string;
  topic: string;
  goal_hours: number;
  blocks: StudyBlock[];
  courses: CourseSummary[];
};

export type TopicStatus = "not-started" | "in-progress" | "done";
export type Topic = {
  id: string;
  unit_id: string;
  course_id: string;
  code: string;
  title: string;
  short_title: string;
  outcome: string;
  est_hours: number;
  planned_week: number | null;
  status: TopicStatus;
  actual_hours: number;
  notes: string;
  position: number;
};
export type Unit = { id: string; course_id: string; code: string; title: string; color: ColorName; position: number; topics: Topic[] };
export type Course = {
  id: string;
  title: string;
  subtitle: string;
  quote: string;
  start_date: string;
  target_date: string;
  weekly_plan: number[];
  color: ColorName;
};
export type CourseDetail = { today: string; course: Course; units: Unit[] };

export type PaymentMethod = "bKash" | "Nagad" | "Card" | "Cash" | "Bank" | "Other";
export type BudgetCategory = {
  id: string;
  name: string;
  color: ColorName;
  icon: string;
  monthly_limit: number;
  is_savings: boolean;
  position: number;
};
export type Transaction = {
  id: string;
  type: "income" | "expense";
  amount: number;
  budget_category_id: string | null;
  description: string;
  note: string;
  method: PaymentMethod;
  tx_date: string;
  created_at: string;
};
export type Bill = {
  id: string;
  name: string;
  note: string;
  amount: number;
  budget_category_id: string | null;
  icon: string;
  due_date: string;
  repeats_monthly: boolean;
};
export type FinanceMonth = { today: string; month: string; categories: BudgetCategory[]; transactions: Transaction[]; bills: Bill[] };

export type HealthLog = {
  log_date: string;
  steps: number | null;
  sleep_minutes: number | null;
  resting_hr: number | null;
  weight_kg: number | null;
  water_glasses: number;
  mood: number | null;
};
export type HealthResponse = { today: string; goals: { steps: number; sleep_minutes: number; water: number }; logs: HealthLog[] };

export type Note = { id: string; title: string; body: string; tag: string; color: ColorName; pinned: boolean; created_at: string; updated_at: string };
export type Reminder = { id: string; text: string; due_date: string | null; done: boolean; created_at: string };

export type Dashboard = {
  today: string;
  name: string;
  stats: {
    tasks: { done: number; total: number };
    goals: { on_track: number; active: number };
    streak: { days: number; name: string };
    wellness: number | null;
  };
  schedule: CalendarEvent[];
  tasks: { today: Task[]; week: Task[]; overdue: Task[] };
  habits: { days: string[]; items: Habit[]; done_today: number };
  goals: Goal[];
  budget: { month: string; total: number; spent: number; categories: { id: string; name: string; color: ColorName; icon: string; limit: number; spent: number }[] };
  health: { steps: number | null; sleep_minutes: number | null; resting_hr: number | null; goals: { steps: number; sleep_minutes: number } };
  reminders: Reminder[];
  productivity: { days: { date: string; count: number }[]; this_week: number; last_week: number; change: number | null };
};

export type SearchItem = { type: string; id: string; title: string; hint: string; href: string };
export type AppNotification = { id: string; icon: string; tone: ColorName; title: string; meta: string; href: string };

export type List<T> = { today?: string; items: T[] };

export type JobStatus = "saved" | "applied" | "interview" | "offer" | "rejected";
export type JobApplication = {
  id: string;
  url: string;
  title: string;
  company: string;
  location: string;
  deadline: string | null;
  status: JobStatus;
  applied_on: string | null;
  summary: string;
  requirements: string[];
  skills: string[];
  notes: string;
  created_at: string;
};

/** What reading a job post found (nothing is saved until the form is submitted). */
export type JobAnalysis = {
  title: string;
  company: string;
  location: string;
  deadline: string | null;
  summary: string;
  requirements: string[];
  skills: string[];
  /** Who read it: Claude, or the keyword rules. */
  by: "ai" | "rules";
  /** Things it could not find, to show next to the form. */
  hints: string[];
};

export type ProjectKind = "website" | "social" | "brand" | "other";
export type ProjectStatus = "active" | "paused" | "done";
export type ProjectLink = { label: string; url: string };

/** A project as listed: its own facts plus what is worked out from its tasks and dates. */
export type Project = {
  id: string;
  name: string;
  kind: ProjectKind;
  status: ProjectStatus;
  color: ColorName;
  client: string;
  goal: string;
  start_date: string | null;
  /** No due date = an ongoing project. */
  due_date: string | null;
  /** When it was moved to the Archive (null = not archived). */
  archived_at: string | null;
  created_at: string;
  /** The same moments as calendar days in your time zone (older saved answers may not have them). */
  created_on?: string;
  archived_on?: string | null;
  timeframe: Timeframe;
  tasks_total: number;
  tasks_done: number;
  tasks_open: number;
  percent: number;
};
export type ProjectDetail = { today: string; project: Project & { links: ProjectLink[]; notes: string }; tasks: Task[] };
/** The short list for pickers (GET /projects?lite=1). */
export type ProjectChoice = { id: string; name: string; color: ColorName; status: ProjectStatus; archived_at: string | null };

