// Time spent on projects AND courses, server side: start and pause a timer, and read the time.
// A project's rows are in project_time, a course's in course_time. A library item (certificate course) keeps its rows in course_time too,
// with the item in resource_id and the course it is linked to in course_id, so its time is the course's time. Only one timer runs at a time across all.
import { endFor, projectState, summariseTime, type ProjectTimeState, type ProjectTimeSummary, type TimeKind, type TimeRow } from "../project-time.ts";
import { HttpError, must } from "./http.ts";
import { fetchAll } from "./paging.ts";
import type { Db } from "./supabase.ts";

type Running = { kind: TimeKind; id: string; started_at: string; name: string; resource_id: string | null };

/** The finished sessions of one project or course. */
async function finishedRows(db: Db, kind: TimeKind, id: string): Promise<TimeRow[]> {
  if (kind === "project") return fetchAll(() => db.from("project_time").select("project_id, started_at, ended_at").eq("project_id", id).not("ended_at", "is", null).order("started_at"));
  const rows = await fetchAll(() => db.from("course_time").select("course_id, resource_id, started_at, ended_at").eq(kind === "resource" ? "resource_id" : "course_id", id).not("ended_at", "is", null).order("started_at"));
  return rows.map((r) => ({ project_id: id, started_at: r.started_at, ended_at: r.ended_at }));
}

/** The running timer, wherever it is (a project or a course), with the name of what it is on. */
async function runningAnywhere(db: Db): Promise<Running | null> {
  const [project, course] = await Promise.all([
    db.from("project_time").select("project_id, started_at").is("ended_at", null).maybeSingle().then(must),
    db.from("course_time").select("course_id, resource_id, started_at").is("ended_at", null).maybeSingle().then(must),
  ]);
  if (project) return { kind: "project", id: project.project_id, started_at: project.started_at, name: must(await db.from("projects").select("name").eq("id", project.project_id).single()).name, resource_id: null };
  if (course?.resource_id) {
    // A library item: the time is the course's when it is linked to one, else the item's own.
    const item = must(await db.from("learning_resources").select("title").eq("id", course.resource_id).single());
    return { kind: course.course_id ? "course" : "resource", id: course.course_id ?? course.resource_id, started_at: course.started_at, name: item.title, resource_id: course.resource_id };
  }
  if (course?.course_id) return { kind: "course", id: course.course_id, started_at: course.started_at, name: must(await db.from("courses").select("title").eq("id", course.course_id).single()).title, resource_id: null };
  return null;
}

export async function timeState(db: Db, kind: TimeKind, id: string, zone: string, today: string, now = Date.now()): Promise<ProjectTimeState> {
  const [rows, running] = await Promise.all([finishedRows(db, kind, id), runningAnywhere(db)]);
  // On a library item's own timer the running row is "here" when it is this item's (whatever course it is linked to).
  const hereId = kind === "resource" && running?.resource_id ? running.resource_id : running?.id ?? id;
  const runKind: TimeKind = kind === "resource" && running?.resource_id ? "resource" : running?.kind ?? "project";
  const all: TimeRow[] = running ? [...rows, { project_id: hereId, started_at: running.started_at, ended_at: null }] : rows;
  return projectState(all, id, running?.name ?? "", today, zone, now, runKind);
}

/** Stops the running timer (of any project or course): its end is now, or 12 hours after it started if it was left running longer. */
async function stopRunning(db: Db, running: Running, now: number) {
  const ended_at = endFor(running.started_at, now);
  if (running.kind === "project") must(await db.from("project_time").update({ ended_at }).eq("project_id", running.id).is("ended_at", null).select("started_at"));
  else must(await db.from("course_time").update({ ended_at }).is("ended_at", null).select("started_at"));
}

/** Starts the timer of a project or course. A timer running on anything else is stopped first (one at a time). Already running here: nothing changes. */
export async function startTimer(db: Db, kind: TimeKind, id: string, now = Date.now()) {
  if (kind === "project") {
    const project = must(await db.from("projects").select("id, archived_at").eq("id", id).single());
    if (project.archived_at) throw new HttpError(400, "This project is in the Archive. Restore it to keep time on it.");
  } else if (kind === "course") {
    must(await db.from("courses").select("id").eq("id", id).single());
  }
  // A library item: its time goes to the course it is linked to (none: it stays on the item).
  const item = kind === "resource" ? must(await db.from("learning_resources").select("id, course_id").eq("id", id).single()) : null;
  const running = await runningAnywhere(db);
  if (item ? running?.resource_id === id : running?.kind === kind && running.id === id) return;
  if (running) await stopRunning(db, running, now);
  const started_at = new Date(now).toISOString();
  const { error } = kind === "project" ? await db.from("project_time").insert({ project_id: id, started_at }) : item ? await db.from("course_time").insert({ course_id: item.course_id, resource_id: item.id, started_at }) : await db.from("course_time").insert({ course_id: id, started_at });
  // Two taps at once: the other one won, and the timer is running. That is what was asked for.
  if (error && error.code !== "23505") must({ data: null, error });
}

/** Pauses the timer of this project or course (nothing to do when it is not running). */
export async function pauseTimer(db: Db, kind: TimeKind, id: string, now = Date.now()) {
  const running = await runningAnywhere(db);
  if (!running) return;
  if (kind === "resource" ? running.resource_id === id : running.kind === kind && running.id === id) await stopRunning(db, running, now);
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
