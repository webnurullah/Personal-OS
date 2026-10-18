// Projects → time spent: the maths of the timer. Plain functions, shared by the server and the pages.
import { addDays } from "./dates.ts";

/** A session is never longer than this (a timer left running overnight is cut here). The database enforces it too. */
export const MAX_SESSION_SECONDS = 12 * 3600;

/** One row of the project_time table. */
export type TimeRow = { project_id: string; started_at: string; ended_at: string | null };

const secondsBetween = (from: string, to: number) => Math.max(0, Math.floor((to - new Date(from).getTime()) / 1000));

/** Seconds of one session: its own length, or (still running) the time since it started, never above 12 hours. */
export function sessionSeconds(row: Pick<TimeRow, "started_at" | "ended_at">, now: number) {
  const end = row.ended_at ? new Date(row.ended_at).getTime() : now;
  return Math.min(MAX_SESSION_SECONDS, secondsBetween(row.started_at, end));
}

/** When a session that is stopped at `now` ends (a session left running for more than 12 hours ends at 12 hours). */
export function endFor(startedAt: string, now: number) {
  const limit = new Date(startedAt).getTime() + MAX_SESSION_SECONDS * 1000;
  return new Date(Math.min(now, limit)).toISOString();
}

/** "1:05:09" (hours, minutes, seconds) for the clock. */
export function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** "2h 05m", "45m", "30s", or "0m" for nothing: for labels. */
export function spent(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return s === 0 ? "0m" : `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

/** The date ("YYYY-MM-DD") a moment falls on, on the clock of a time zone. */
export function dayOf(iso: string, zone: string) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  } catch {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  }
}

export type ProjectTimeLine = { id: string; name: string; color: string; total_seconds: number; week_seconds: number; by_day: number[] };
export type ProjectTimeSummary = {
  today: string;
  /** The days shown, oldest first, ending today. */
  days: string[];
  projects: ProjectTimeLine[];
  today_seconds: number;
  week_seconds: number;
  total_seconds: number;
  running: { project_id: string; name: string; started_at: string } | null;
  /** The server's clock when this was worked out (ISO), so a ticking clock can correct for a wrong phone clock. */
  now: string;
};

/**
 * Time per project and per day. A session counts on the day it STARTED (in the time zone of the person).
 * `days` is how many days to list (ending today); every project that has time (or a running timer) is listed, most time this period first.
 */
export function summariseTime(rows: TimeRow[], projects: { id: string; name: string; color: string }[], today: string, zone: string, days: number, now: number): ProjectTimeSummary {
  const list = Array.from({ length: days }, (_, i) => addDays(today, i - days + 1));
  const index = new Map(list.map((d, i) => [d, i]));
  const lines = new Map<string, ProjectTimeLine>();
  const byId = new Map(projects.map((p) => [p.id, p]));
  let running: ProjectTimeSummary["running"] = null;

  for (const row of rows) {
    const project = byId.get(row.project_id);
    if (!project) continue;
    const seconds = sessionSeconds(row, now);
    const line = lines.get(project.id) ?? { id: project.id, name: project.name, color: project.color, total_seconds: 0, week_seconds: 0, by_day: list.map(() => 0) };
    line.total_seconds += seconds;
    const slot = index.get(dayOf(row.started_at, zone));
    if (slot !== undefined) {
      line.by_day[slot] += seconds;
      line.week_seconds += seconds;
    }
    lines.set(project.id, line);
    if (!row.ended_at) running = { project_id: project.id, name: project.name, started_at: row.started_at };
  }

  const out = [...lines.values()].sort((a, b) => b.week_seconds - a.week_seconds || b.total_seconds - a.total_seconds || a.name.localeCompare(b.name));
  const sum = (pick: (l: ProjectTimeLine) => number) => out.reduce((n, l) => n + pick(l), 0);
  return {
    today,
    days: list,
    projects: out,
    today_seconds: sum((l) => l.by_day[days - 1] ?? 0),
    week_seconds: sum((l) => l.week_seconds),
    total_seconds: sum((l) => l.total_seconds),
    running,
    now: new Date(now).toISOString(),
  };
}

/** What the project page needs for one project. */
export type ProjectTimeState = {
  now: string;
  /** Time of finished sessions (a running one is added by the clock). */
  closed_seconds: number;
  /** Finished time that started today. */
  today_closed_seconds: number;
  /** The running timer (any project), if there is one. */
  running: { project_id: string; name: string; started_at: string; started_today: boolean } | null;
};

export function projectState(rows: TimeRow[], projectId: string, runningName: string, today: string, zone: string, now: number): ProjectTimeState {
  let closed = 0;
  let todayClosed = 0;
  let running: ProjectTimeState["running"] = null;
  for (const row of rows) {
    if (!row.ended_at) {
      running = { project_id: row.project_id, name: runningName, started_at: row.started_at, started_today: dayOf(row.started_at, zone) === today };
      continue;
    }
    if (row.project_id !== projectId) continue;
    const seconds = sessionSeconds(row, now);
    closed += seconds;
    if (dayOf(row.started_at, zone) === today) todayClosed += seconds;
  }
  return { now: new Date(now).toISOString(), closed_seconds: closed, today_closed_seconds: todayClosed, running };
}
