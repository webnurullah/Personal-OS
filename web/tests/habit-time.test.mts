import test from "node:test";
import assert from "node:assert/strict";
import { goalReached, minutesText, minutesToday, type SourceRow } from "../lib/habit-time.ts";
import { autoCheckHabits, habitGoals } from "../lib/server/habit-time.ts";
import type { Db } from "../lib/server/supabase.ts";

const T = (iso: string) => new Date(iso).getTime();
const Z = "Asia/Dhaka"; // UTC+6, so 2026-10-18 starts at 2026-10-17T18:00Z
const row = (key: string, from: string, to: string | null): SourceRow => ({ key, started_at: from, ended_at: to });
const NOW = T("2026-10-18T10:00:00Z");

test("minutes counted today: only the habit's sources, only sessions that started today", () => {
  const rows = [
    row("project:a", "2026-10-18T04:00:00Z", "2026-10-18T05:00:00Z"), // 60 min today
    row("course:c", "2026-10-18T06:00:00Z", "2026-10-18T06:30:00Z"), // 30 min today
    row("project:other", "2026-10-18T06:00:00Z", "2026-10-18T09:00:00Z"), // not a source
    row("project:a", "2026-10-17T10:00:00Z", "2026-10-17T12:00:00Z"), // yesterday
  ];
  assert.equal(minutesToday(rows, new Set(["project:a", "course:c"]), "2026-10-18", Z, NOW), 90);
  assert.equal(minutesToday(rows, new Set(["project:a"]), "2026-10-18", Z, NOW), 60);
  assert.equal(minutesToday(rows, new Set(), "2026-10-18", Z, NOW), 0);
});

test("the day is the person's day: 23:00 UTC on the 17th is already the 18th in Dhaka", () => {
  const rows = [row("project:a", "2026-10-17T19:00:00Z", "2026-10-17T20:00:00Z")];
  assert.equal(minutesToday(rows, new Set(["project:a"]), "2026-10-18", Z, NOW), 60);
  assert.equal(minutesToday(rows, new Set(["project:a"]), "2026-10-17", Z, NOW), 0);
});

test("a running timer counts up to now, and never more than 12 hours", () => {
  const running = [row("project:a", "2026-10-18T09:00:00Z", null)];
  assert.equal(minutesToday(running, new Set(["project:a"]), "2026-10-18", Z, NOW), 60);
  const left = [row("project:a", "2026-10-17T18:30:00Z", null)];
  assert.equal(minutesToday(left, new Set(["project:a"]), "2026-10-18", Z, T("2026-10-19T10:00:00Z")), 12 * 60);
});

test("two timers at the same time count once (overlap), the rest adds up", () => {
  const rows = [
    row("project:a", "2026-10-18T04:00:00Z", "2026-10-18T05:00:00Z"),
    row("course:c", "2026-10-18T04:30:00Z", "2026-10-18T05:30:00Z"), // 30 min overlap with the first
    row("course:c", "2026-10-18T07:00:00Z", "2026-10-18T07:10:00Z"),
  ];
  assert.equal(minutesToday(rows, new Set(["project:a", "course:c"]), "2026-10-18", Z, NOW), 100); // 04:00-05:30 once, plus 10 minutes
});

test("the goal is reached at exactly the goal; no goal never is", () => {
  assert.equal(goalReached(120, 119), false);
  assert.equal(goalReached(120, 120), true);
  assert.equal(goalReached(null, 999), false);
  assert.equal(goalReached(undefined, 999), false);
  assert.deepEqual([minutesText(0), minutesText(45), minutesText(120), minutesText(135)], ["0m", "45m", "2h", "2h 15m"]);
});

// ---- the server side, against a small stand-in database ----
type R = Record<string, unknown>;
function fakeDb(tables: Record<string, R[]>) {
  const log: string[] = [];
  const db = {
    from(name: string) {
      let rows = [...(tables[name] ?? [])];
      let action = "select";
      let patch: R = {};
      let upserted: R | null = null;
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (c: string, v: unknown) => { rows = rows.filter((r) => r[c] === v); return q; },
        is: (c: string, v: unknown) => { rows = rows.filter((r) => (r[c] ?? null) === v); return q; },
        not: (c: string, _op: string, v: unknown) => { rows = rows.filter((r) => (r[c] ?? null) !== v); return q; },
        gte: (c: string, v: string) => { rows = rows.filter((r) => String(r[c]) >= v); return q; },
        order: () => q,
        range: (from: number, to: number) => Promise.resolve({ data: rows.slice(from, to + 1), error: null }),
        update: (p: R) => { action = "update"; patch = p; return q; },
        upsert: (r: R) => { action = "upsert"; upserted = r; return q; },
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
          if (action === "update") { for (const r of rows) Object.assign(r, patch); log.push(`update ${name}`); }
          if (action === "upsert") { log.push(`upsert ${name}`); tables[name].push(upserted as R); }
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        },
      };
      return q;
    },
  } as unknown as Db;
  return { db, log };
}

const habit = (over: R = {}) => ({ id: "h1", user_id: "u", target_minutes: 120, auto_checked_on: null, archived_at: null, ...over });
const base = () => ({
  habits: [habit()] as R[],
  habit_sources: [{ habit_id: "h1", project_id: "p1", course_id: null }, { habit_id: "h1", project_id: null, course_id: "c1" }] as R[],
  projects: [{ id: "p1", name: "CRM" }] as R[],
  courses: [{ id: "c1", title: "Digital Marketing" }] as R[],
  habit_logs: [] as R[],
  project_time: [{ project_id: "p1", started_at: "2026-10-18T04:00:00.000Z", ended_at: "2026-10-18T05:00:00.000Z" }] as R[],
  course_time: [{ course_id: "c1", resource_id: null, started_at: "2026-10-18T06:00:00.000Z", ended_at: "2026-10-18T06:59:00.000Z" }] as R[],
});

test("below the goal: minutes and sources are reported, nothing is ticked", async () => {
  const t = base();
  const { db, log } = fakeDb(t);
  const { goals, ticked } = await habitGoals(db, t.habits as never, "2026-10-18", Z, NOW);
  assert.deepEqual(ticked, []);
  assert.equal(log.length, 0);
  assert.deepEqual(goals.get("h1"), { target_minutes: 120, today_minutes: 119, sources: [{ kind: "project", id: "p1", name: "CRM" }, { kind: "course", id: "c1", name: "Digital Marketing" }] });
});

test("at the goal the day is ticked once; a day unticked by hand is not ticked again", async () => {
  const t = base();
  t.course_time[0].ended_at = "2026-10-18T07:00:00.000Z"; // 60 + 60 = 120
  const { db } = fakeDb(t);
  const first = await habitGoals(db, t.habits as never, "2026-10-18", Z, NOW);
  assert.deepEqual(first.ticked, ["h1"]);
  assert.deepEqual(t.habit_logs.map((l) => [l.habit_id, l.log_date]), [["h1", "2026-10-18"]]);
  assert.equal(t.habits[0].auto_checked_on, "2026-10-18");
  t.habit_logs.length = 0; // the person unticks it
  const again = await habitGoals(db, t.habits as never, "2026-10-18", Z, NOW + 60_000);
  assert.deepEqual(again.ticked, []);
  assert.equal(t.habit_logs.length, 0);
  // Tomorrow it can tick again.
  t.project_time[0].started_at = "2026-10-19T04:00:00.000Z"; t.project_time[0].ended_at = "2026-10-19T05:00:00.000Z";
  t.course_time[0].started_at = "2026-10-19T06:00:00.000Z"; t.course_time[0].ended_at = "2026-10-19T07:00:00.000Z";
  const next = await habitGoals(db, t.habits as never, "2026-10-19", Z, T("2026-10-19T10:00:00Z"));
  assert.deepEqual(next.ticked, ["h1"]);
});

test("a running timer that passes the goal ticks the habit while it runs", async () => {
  const t = base();
  t.project_time[0].ended_at = null;
  t.project_time[0].started_at = "2026-10-18T07:30:00.000Z"; // running 150 minutes at NOW (10:00Z)
  t.course_time.length = 0;
  const { db } = fakeDb(t);
  assert.deepEqual((await autoCheckHabits(db, "2026-10-18", Z, NOW)).length, 1);
});

test("habits without a goal or without sources are left alone", async () => {
  const t = base();
  t.habits.push(habit({ id: "h2", target_minutes: null }), habit({ id: "h3" }));
  const { db } = fakeDb(t);
  const { goals, ticked } = await habitGoals(db, t.habits as never, "2026-10-18", Z, NOW);
  assert.deepEqual(ticked, []);
  assert.deepEqual([goals.get("h2")?.today_minutes, goals.get("h3")?.today_minutes, goals.get("h3")?.sources], [0, 0, []]);
});
