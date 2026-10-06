// Projects: time labels, progress, sorting, link safety, and the request schemas. Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { compareProjects, isHttpUrl, summarise, timeframe } from "../lib/projects.ts";
import { ProjectCreate, ProjectFields, TaskCreate, TaskUpdate } from "../lib/server/schemas.ts";

const today = "2026-10-06";
const project = (over: Partial<{ id: string; status: string; start_date: string | null; due_date: string | null; created_at: string }> = {}) => ({
  id: "p1", status: "active", start_date: null, due_date: null, created_at: "2026-09-01T10:00:00Z", ...over,
});

test("a project with a due date counts down, then goes overdue", () => {
  const t = (due: string, status = "active") => timeframe(project({ due_date: due, status }), today);
  assert.deepEqual([t("2026-10-11").label, t("2026-10-11").tone], ["Due in 5 days", "ok"]);
  assert.deepEqual([t("2026-10-09").label, t("2026-10-09").tone], ["Due in 3 days", "soon"]);
  assert.equal(t("2026-10-07").label, "Due tomorrow");
  assert.deepEqual([t("2026-10-06").label, t("2026-10-06").tone], ["Due today", "soon"]);
  assert.deepEqual([t("2026-10-05").label, t("2026-10-05").tone], ["Overdue by 1 day", "late"]);
  assert.equal(t("2026-10-01").label, "Overdue by 5 days");
  assert.equal(t("2026-10-11").days, 5);
  assert.equal(t("2026-10-01").days, -5);
});

test("a paused project is never flagged, and a done project is never overdue", () => {
  assert.equal(timeframe(project({ due_date: "2026-10-01", status: "paused" }), today).tone, "none");
  assert.deepEqual(timeframe(project({ due_date: "2026-10-01", status: "done" }), today), { kind: "ended", label: "Done", days: null, tone: "none" });
  assert.equal(timeframe(project({ status: "done" }), today).kind, "ended");
});

test("a project with no due date is ongoing and shows how long it has been running", () => {
  const a = timeframe(project({ start_date: "2026-09-02" }), today);
  assert.deepEqual([a.kind, a.label, a.days, a.tone], ["ongoing", "Ongoing · running 34 days", null, "none"]);
  // No start date: counted from the day it was added (1 Sep).
  assert.equal(timeframe(project(), today).label, "Ongoing · running 35 days");
  assert.equal(timeframe(project({ start_date: "2026-10-06" }), today).label, "Ongoing · started today");
  assert.equal(timeframe(project({ start_date: "2026-10-05" }), today).label, "Ongoing · running 1 day");
  assert.equal(timeframe(project({ start_date: "2026-10-09" }), today).label, "Starts in 3 days");
  // Ongoing projects are never late, however long they run.
  assert.equal(timeframe(project({ start_date: "2020-01-01" }), today).tone, "none");
});

test("a dated project that has not started yet says when it starts", () => {
  const t = timeframe(project({ start_date: "2026-10-10", due_date: "2026-11-10" }), today);
  assert.deepEqual([t.label, t.tone], ["Starts in 4 days", "none"]);
});

test("progress comes from the linked tasks", () => {
  const projects = [project({ id: "a" }), project({ id: "b" }), project({ id: "c" })];
  const tasks = [
    { project_id: "a", done_at: "2026-10-01T00:00:00Z" },
    { project_id: "a", done_at: null },
    { project_id: "a", done_at: null },
    { project_id: "b", done_at: "2026-10-02T00:00:00Z" },
    { project_id: null, done_at: null }, // not in a project
    { project_id: "zzz", done_at: null }, // unknown project: ignored
  ];
  const [a, b, c] = summarise(projects, tasks, today);
  assert.deepEqual([a.tasks_total, a.tasks_done, a.tasks_open, a.percent], [3, 1, 2, 33]);
  assert.deepEqual([b.tasks_total, b.tasks_done, b.tasks_open, b.percent], [1, 1, 0, 100]);
  assert.deepEqual([c.tasks_total, c.tasks_done, c.tasks_open, c.percent], [0, 0, 0, 0]); // no divide-by-zero
  assert.equal(a.timeframe.kind, "ongoing");
  assert.equal(a.id, "a"); // the project's own fields are kept
});

test("dated projects are listed by nearest due date, then ongoing ones, newest first", () => {
  const list = [
    { id: "ongoing-old", due_date: null, created_at: "2026-01-01" },
    { id: "late", due_date: "2026-12-01", created_at: "2026-02-01" },
    { id: "ongoing-new", due_date: null, created_at: "2026-09-01" },
    { id: "soon", due_date: "2026-10-10", created_at: "2026-03-01" },
  ];
  assert.deepEqual([...list].sort(compareProjects).map((p) => p.id), ["soon", "late", "ongoing-new", "ongoing-old"]);
});

test("only web addresses are links", () => {
  assert.equal(isHttpUrl("https://example.com/path?x=1"), true);
  assert.equal(isHttpUrl("http://localhost:3000"), true);
  assert.equal(isHttpUrl("javascript:alert(1)"), false);
  assert.equal(isHttpUrl("data:text/html,<b>x</b>"), false);
  assert.equal(isHttpUrl("example.com"), false);
  assert.equal(isHttpUrl(""), false);
});

test("project requests: strict, validated, dates optional", () => {
  assert.equal(ProjectCreate.safeParse({ name: "My site" }).success, true);
  assert.equal(ProjectCreate.safeParse({}).success, false); // a name is required
  assert.equal(ProjectCreate.safeParse({ name: "   " }).success, false);
  assert.equal(ProjectCreate.safeParse({ name: "x", surprise: 1 }).success, false); // unknown key
  assert.equal(ProjectCreate.safeParse({ name: "x", kind: "game" }).success, false);
  assert.equal(ProjectCreate.safeParse({ name: "x", due_date: null, start_date: null }).success, true); // ongoing
  assert.equal(ProjectCreate.safeParse({ name: "x", due_date: "2026-13-40" }).success, false);
  assert.equal(ProjectFields.safeParse({ status: "paused" }).success, true); // PATCH: any single field
  assert.equal(ProjectFields.safeParse({}).success, true);
  const link = (url: string) => ProjectCreate.safeParse({ name: "x", links: [{ label: "Live", url }] }).success;
  assert.equal(link("https://example.com"), true);
  assert.equal(link("javascript:alert(1)"), false);
  assert.equal(link("not a link"), false);
  assert.equal(ProjectCreate.safeParse({ name: "x", links: Array.from({ length: 13 }, () => ({ label: "a", url: "https://a.com" })) }).success, false);
});

test("archiving is a switch on an existing project, never part of creating one", () => {
  assert.equal(ProjectFields.safeParse({ archived: true }).success, true);
  assert.equal(ProjectFields.safeParse({ archived: false }).success, true); // restore
  assert.equal(ProjectFields.safeParse({ archived: "yes" }).success, false);
  assert.equal(ProjectCreate.safeParse({ name: "x", archived: true }).success, false);
  assert.equal(ProjectFields.safeParse({ archived_at: "2026-10-06T00:00:00Z" }).success, false); // the API sets the time itself
});

test("a task can be linked to a project, or unlinked", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  assert.equal(TaskCreate.safeParse({ title: "Design home page", project_id: id }).success, true);
  assert.equal(TaskCreate.safeParse({ title: "x", project_id: null }).success, true);
  assert.equal(TaskCreate.safeParse({ title: "x", project_id: "not-an-id" }).success, false);
  assert.equal(TaskUpdate.safeParse({ project_id: null }).success, true); // unlink
  assert.equal(TaskCreate.safeParse({ title: "x", other: 1 }).success, false);
});
