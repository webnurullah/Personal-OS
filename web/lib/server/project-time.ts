// Projects → time spent, server side: start and pause the timer of a project, and read the time.
import { endFor, projectState, summariseTime, type ProjectTimeState, type ProjectTimeSummary, type TimeRow } from "../project-time.ts";
import { HttpError, must } from "./http.ts";
import { fetchAll } from "./paging.ts";
import type { Db } from "./supabase.ts";

/** The rows of one project, plus the running timer of any project (there is at most one). */
async function rowsFor(db: Db, projectId: string): Promise<{ rows: TimeRow[]; runningName: string }> {
  const [own, running] = await Promise.all([
    fetchAll(() => db.from("project_time").select("project_id, started_at, ended_at").eq("project_id", projectId).not("ended_at", "is", null).order("started_at")),
    db.from("project_time").select("project_id, started_at, ended_at").is("ended_at", null).maybeSingle().then(must),
  ]);
  const runningRow = running ?? null;
  let runningName = "";
  if (runningRow) runningName = must(await db.from("projects").select("name").eq("id", runningRow.project_id).single()).name;
  return { rows: runningRow ? [...own, runningRow] : own, runningName };
}

export async function timeState(db: Db, projectId: string, zone: string, today: string, now = Date.now()): Promise<ProjectTimeState> {
  const { rows, runningName } = await rowsFor(db, projectId);
  return projectState(rows, projectId, runningName, today, zone, now);
}

/** Stops the running timer (of any project): its end is now, or 12 hours after it started if it was left running longer. */
async function stopRunning(db: Db, now: number) {
  const running = must(await db.from("project_time").select("started_at").is("ended_at", null).maybeSingle());
  if (running) must(await db.from("project_time").update({ ended_at: endFor(running.started_at, now) }).is("ended_at", null).select("started_at"));
}

/** Starts the timer of a project. A timer running on another project is stopped first (one at a time). Already running here: nothing changes. */
export async function startTimer(db: Db, projectId: string, now = Date.now()) {
  const project = must(await db.from("projects").select("id, archived_at").eq("id", projectId).single());
  if (project.archived_at) throw new HttpError(400, "This project is in the Archive. Restore it to keep time on it.");
  const running = must(await db.from("project_time").select("project_id").is("ended_at", null).maybeSingle());
  if (running?.project_id === projectId) return;
  if (running) await stopRunning(db, now);
  const { error } = await db.from("project_time").insert({ project_id: projectId, started_at: new Date(now).toISOString() });
  // Two taps at once: the other one won, and the timer is running. That is what was asked for.
  if (error && error.code !== "23505") must({ data: null, error });
}

/** Pauses the timer of this project (nothing to do when it is not running). */
export async function pauseTimer(db: Db, projectId: string, now = Date.now()) {
  const running = must(await db.from("project_time").select("project_id, started_at").is("ended_at", null).maybeSingle());
  if (!running || running.project_id !== projectId) return;
  must(await db.from("project_time").update({ ended_at: endFor(running.started_at, now) }).eq("project_id", projectId).is("ended_at", null).select("started_at"));
}

/** Time per project and per day for the Habits page, with the running timer. */
export async function timeSummary(db: Db, zone: string, today: string, days: number, now = Date.now()): Promise<ProjectTimeSummary> {
  const [rows, projects] = await Promise.all([
    fetchAll(() => db.from("project_time").select("project_id, started_at, ended_at").order("id")),
    fetchAll(() => db.from("projects").select("id, name, color").order("id")),
  ]);
  return summariseTime(rows, projects, today, zone, days, now);
}
