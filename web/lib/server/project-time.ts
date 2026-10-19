// Time spent on projects AND courses, server side: start and pause a timer, and read the time.
// A project's rows are in project_time, a course's in course_time. A library item (certificate course) keeps its rows in course_time too,
// with the item in resource_id and the course it is linked to in course_id, so its time is the course's time. Several timers can run at the same time.
import { endFor, projectState, sessionSeconds, summariseTime, type ProjectTimeState, type ProjectTimeSummary, type TimeKind, type TimeRow } from "../project-time.ts";
import { HttpError, must } from "./http.ts";
import { fetchAll } from "./paging.ts";
import type { Db } from "./supabase.ts";

/** One running timer row, with what it is on. */
type Running = { kind: TimeKind; id: string; started_at: string; name: string; resource_id: string | null; course_id: string | null };

/** The finished sessions of one project, course or library item. */
async function finishedRows(db: Db, kind: TimeKind, id: string): Promise<TimeRow[]> {
  if (kind === "project") return fetchAll(() => db.from("project_time").select("project_id, started_at, ended_at").eq("project_id", id).not("ended_at", "is", null).order("started_at"));
  const rows = await fetchAll(() => db.from("course_time").select("course_id, resource_id, started_at, ended_at").eq(kind === "resource" ? "resource_id" : "course_id", id).not("ended_at", "is", null).order("started_at"));
  return rows.map((r) => ({ project_id: id, started_at: r.started_at, ended_at: r.ended_at }));
}

/** Every running timer (several can run at once: projects, courses, certificate courses), with the name of what each is on. */
export async function runningAll(db: Db): Promise<Running[]> {
  const [projects, courses] = await Promise.all([
    db.from("project_time").select("project_id, started_at").is("ended_at", null).order("started_at").then(must),
    db.from("course_time").select("course_id, resource_id, started_at").is("ended_at", null).order("started_at").then(must),
  ]);
  const out: Running[] = [];
  for (const r of projects) out.push({ kind: "project", id: r.project_id, started_at: r.started_at, name: must(await db.from("projects").select("name").eq("id", r.project_id).single()).name, resource_id: null, course_id: null });
  for (const r of courses) {
    if (r.resource_id) {
      // A library item: its time is the course's when it is linked to one, and always its own.
      const item = must(await db.from("learning_resources").select("title").eq("id", r.resource_id).single());
      out.push({ kind: "resource", id: r.resource_id, started_at: r.started_at, name: item.title, resource_id: r.resource_id, course_id: r.course_id });
    } else if (r.course_id) {
      out.push({ kind: "course", id: r.course_id, started_at: r.started_at, name: must(await db.from("courses").select("title").eq("id", r.course_id).single()).title, resource_id: null, course_id: r.course_id });
    }
  }
  return out;
}

/** The running timer that counts for this project, course or item (a certificate course of a course also counts for the course), if any. */
const hereOf = (running: Running[], kind: TimeKind, id: string) =>
  running.find((r) => (kind === "resource" ? r.resource_id === id : kind === "course" ? r.course_id === id : r.kind === "project" && r.id === id));

export async function timeState(db: Db, kind: TimeKind, id: string, zone: string, today: string, now = Date.now()): Promise<ProjectTimeState> {
  const [rows, running] = await Promise.all([finishedRows(db, kind, id), runningAll(db)]);
  const here = hereOf(running, kind, id);
  const all: TimeRow[] = here ? [...rows, { project_id: id, started_at: here.started_at, ended_at: null }] : rows;
  return projectState(all, id, here?.name ?? "", today, zone, now, kind);
}

/** Stops one running timer: its end is now, or 12 hours after it started if it was left running longer. */
async function stopRunning(db: Db, running: Running, now: number) {
  const ended_at = endFor(running.started_at, now);
  if (running.kind === "project") must(await db.from("project_time").update({ ended_at }).eq("project_id", running.id).is("ended_at", null).select("started_at"));
  else if (running.resource_id) must(await db.from("course_time").update({ ended_at }).eq("resource_id", running.resource_id).is("ended_at", null).select("started_at"));
  else must(await db.from("course_time").update({ ended_at }).eq("course_id", running.id).is("resource_id", null).is("ended_at", null).select("started_at"));
}

/**
 * Starts the timer of a project, course or library item. Other timers keep running (several at once). Already running here: nothing changes.
 * A certificate course linked to a course pauses that course's own timer, so the time is not counted twice.
 */
export async function startTimer(db: Db, kind: TimeKind, id: string, now = Date.now()) {
  if (kind === "project") {
    const project = must(await db.from("projects").select("id, archived_at").eq("id", id).single());
    if (project.archived_at) throw new HttpError(400, "This project is in the Archive. Restore it to keep time on it.");
  } else if (kind === "course") {
    must(await db.from("courses").select("id").eq("id", id).single());
  }
  const item = kind === "resource" ? must(await db.from("learning_resources").select("id, course_id").eq("id", id).single()) : null;
  const running = await runningAll(db);
  if (hereOf(running, kind, id)) return;
  if (item?.course_id) for (const r of running) if (r.kind === "course" && r.id === item.course_id) await stopRunning(db, r, now);
  const started_at = new Date(now).toISOString();
  const insert = () => (kind === "project" ? db.from("project_time").insert({ project_id: id, started_at }) : item ? db.from("course_time").insert({ course_id: item.course_id, resource_id: item.id, started_at }) : db.from("course_time").insert({ course_id: id, started_at }));
  let { error } = await insert();
  if (error?.code === "23505") {
    // The database still allows one running timer per person (older rule): pause the others first, then start.
    const again = await runningAll(db);
    if (!hereOf(again, kind, id)) {
      for (const r of again) await stopRunning(db, r, now);
      ({ error } = await insert());
    }
  }
  // Two taps at once: the other one won, and the timer is running. That is what was asked for.
  if (error && error.code !== "23505") must({ data: null, error });
}

/** Pauses the timer of this project, course or item (nothing to do when it is not running). */
export async function pauseTimer(db: Db, kind: TimeKind, id: string, now = Date.now()) {
  const running = await runningAll(db);
  for (const r of running) {
    if (kind === "resource" ? r.resource_id === id : kind === "course" ? r.course_id === id : r.kind === "project" && r.id === id) await stopRunning(db, r, now);
  }
}

/** The timers for the circles on every page: each running one with what it is on and its time so far (finished sessions; the clock adds the running one). */
export type RunningTimer = { key: string; kind: TimeKind; id: string; name: string; module: "Project" | "Course" | "Certificate"; href: string; started_at: string; closed_seconds: number };
export async function runningTimers(db: Db, now = Date.now()): Promise<{ now: string; timers: RunningTimer[] }> {
  const running = await runningAll(db);
  const timers = await Promise.all(
    running.map(async (r): Promise<RunningTimer> => {
      const rows = await finishedRows(db, r.kind, r.kind === "resource" ? (r.resource_id as string) : r.id);
      const closed = rows.reduce((sum, row) => sum + sessionSeconds(row, now), 0);
      const href = r.kind === "project" ? `/projects/${r.id}` : r.kind === "course" ? `/learning/${r.id}` : r.course_id ? `/learning/${r.course_id}` : "/learning/library";
      return { key: `${r.kind}:${r.id}`, kind: r.kind, id: r.id, name: r.name, module: r.kind === "project" ? "Project" : r.kind === "course" ? "Course" : "Certificate", href, started_at: r.started_at, closed_seconds: closed };
    }),
  );
  return { now: new Date(now).toISOString(), timers };
}

/** Time per project and course and per day for the Habits page, with the running timer. */
export async function timeSummary(db: Db, zone: string, today: string, days: number, now = Date.now()): Promise<ProjectTimeSummary> {
  const [projectRows, courseRows, projects, courses] = await Promise.all([
    fetchAll(() => db.from("project_time").select("project_id, started_at, ended_at").order("id")),
    fetchAll(() => db.from("course_time").select("course_id, started_at, ended_at").order("id")),
    fetchAll(() => db.from("projects").select("id, name, color").order("id")),
    fetchAll(() => db.from("courses").select("id, title, color").order("id")),
  ]);
  const rows: TimeRow[] = [...projectRows, ...courseRows.map((r) => ({ project_id: r.course_id ?? "", started_at: r.started_at, ended_at: r.ended_at }))];
  const items = [...projects.map((p) => ({ id: p.id, name: p.name, color: p.color, kind: "project" as TimeKind })), ...courses.map((c) => ({ id: c.id, name: c.title, color: c.color, kind: "course" as TimeKind }))];
  return summariseTime(rows, items, today, zone, days, now);
}
