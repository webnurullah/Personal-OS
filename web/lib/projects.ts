// Projects: the facts that are worked out from your data (never stored): how long a project has been
// running or how many days are left, task progress, and the order projects are listed in.
// Plain functions with no React, so both the pages and the tests use them.
import { daysBetween } from "./dates.ts";

export const PROJECT_KINDS = [
  { value: "website", label: "Website" },
  { value: "social", label: "Social media" },
  { value: "brand", label: "Personal brand" },
  { value: "other", label: "Other" },
] as const;

export const PROJECT_STATUSES = [
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "done", label: "Done" },
] as const;

export const kindLabel = (kind: string) => PROJECT_KINDS.find((k) => k.value === kind)?.label ?? "Other";

/** Links are typed by hand: only web addresses may be opened (never `javascript:` and the like). */
export function isHttpUrl(text: string) {
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** `created_on` is the day it was added in the user's time zone (the API sends it); older saved answers may not have it. */
type ProjectFacts = { status: string; start_date: string | null; due_date: string | null; created_at: string; created_on?: string };

/** How a project stands in time. `tone` is only "late" or "soon" for an ACTIVE dated project. */
export type Timeframe = {
  kind: "dated" | "ongoing" | "ended";
  label: string;
  /** Days until the due date (negative = overdue), or null for ongoing and finished projects. */
  days: number | null;
  tone: "late" | "soon" | "ok" | "none";
};

const days = (n: number, word = "day") => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * A project with a due date is dated: "Due in 5 days", "Overdue by 2 days".
 * One without is ongoing: "Ongoing · running 34 days" (counted from the start date, or the day it was added in the user's time zone).
 * A finished project is just "Done", and a paused one is never flagged as late.
 */
export function timeframe(project: ProjectFacts, today: string): Timeframe {
  if (project.status === "done") return { kind: "ended", label: "Done", days: null, tone: "none" };
  const active = project.status === "active";
  const started = project.start_date ?? project.created_on ?? project.created_at.slice(0, 10);

  if (!project.due_date) {
    const running = daysBetween(started, today);
    if (running < 0) return { kind: "ongoing", label: `Starts in ${days(-running)}`, days: null, tone: "none" };
    return { kind: "ongoing", label: running === 0 ? "Ongoing · started today" : `Ongoing · running ${days(running)}`, days: null, tone: "none" };
  }

  const left = daysBetween(today, project.due_date);
  const untilStart = project.start_date ? daysBetween(today, project.start_date) : 0;
  if (untilStart > 0) return { kind: "dated", label: `Starts in ${days(untilStart)}`, days: left, tone: "none" };
  const label = left > 1 ? `Due in ${days(left)}` : left === 1 ? "Due tomorrow" : left === 0 ? "Due today" : `Overdue by ${days(-left)}`;
  const tone = !active ? "none" : left < 0 ? "late" : left <= 3 ? "soon" : "ok";
  return { kind: "dated", label, days: left, tone };
}

/** Share of tasks done, 0-100 (0 when there are none yet). */
export const progress = (done: number, total: number) => (total ? Math.round((done / total) * 100) : 0);

type TaskFacts = { project_id: string | null; done_at: string | null };

export type ProjectSummary<P> = P & { timeframe: Timeframe; tasks_total: number; tasks_done: number; tasks_open: number; percent: number };

/** Adds task counts, progress and the timeframe to each project. */
export function summarise<P extends ProjectFacts & { id: string }>(projects: P[], tasks: TaskFacts[], today: string): ProjectSummary<P>[] {
  const counts = new Map<string, { total: number; done: number }>();
  for (const t of tasks) {
    if (!t.project_id) continue;
    const c = counts.get(t.project_id) ?? { total: 0, done: 0 };
    c.total++;
    if (t.done_at) c.done++;
    counts.set(t.project_id, c);
  }
  return projects.map((p) => {
    const c = counts.get(p.id) ?? { total: 0, done: 0 };
    return { ...p, timeframe: timeframe(p, today), tasks_total: c.total, tasks_done: c.done, tasks_open: c.total - c.done, percent: progress(c.done, c.total) };
  });
}

/** Dated projects first, nearest due date first; then ongoing ones, newest first. */
export function compareProjects(a: { due_date: string | null; created_at: string }, b: { due_date: string | null; created_at: string }) {
  if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date) || b.created_at.localeCompare(a.created_at);
  if (a.due_date) return -1;
  if (b.due_date) return 1;
  return b.created_at.localeCompare(a.created_at);
}
