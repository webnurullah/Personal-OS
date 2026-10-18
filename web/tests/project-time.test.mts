// Projects → time spent: the timer maths and the start / pause rules. Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { clock, dayOf, endFor, MAX_SESSION_SECONDS, projectState, sessionSeconds, spent, summariseTime, type TimeRow } from "../lib/project-time.ts";
import { pauseTimer, startTimer, timeState } from "../lib/server/project-time.ts";
import { HttpError } from "../lib/server/http.ts";
import type { Db } from "../lib/server/supabase.ts";

const T = (iso: string) => new Date(iso).getTime();

test("a finished session is as long as it lasted; a running one counts up to now, and never past 12 hours", () => {
  assert.equal(sessionSeconds({ started_at: "2026-10-18T04:00:00Z", ended_at: "2026-10-18T05:30:30Z" }, T("2026-10-19T00:00:00Z")), 5430);
  assert.equal(sessionSeconds({ started_at: "2026-10-18T04:00:00Z", ended_at: null }, T("2026-10-18T04:10:00Z")), 600);
  assert.equal(sessionSeconds({ started_at: "2026-10-18T04:00:00Z", ended_at: null }, T("2026-10-20T04:00:00Z")), MAX_SESSION_SECONDS, "left running for days");
  assert.equal(sessionSeconds({ started_at: "2026-10-18T04:00:00Z", ended_at: null }, T("2026-10-18T03:00:00Z")), 0, "a clock that is behind never gives a negative time");
});

test("pausing a timer that was left running ends it at 12 hours, otherwise now", () => {
  assert.equal(endFor("2026-10-18T04:00:00Z", T("2026-10-18T06:00:00Z")), "2026-10-18T06:00:00.000Z");
  assert.equal(endFor("2026-10-18T04:00:00Z", T("2026-10-19T09:00:00Z")), "2026-10-18T16:00:00.000Z");
});

test("the clock reads hours:minutes:seconds and the label reads like 2h 05m", () => {
  assert.equal(clock(0), "0:00:00");
  assert.equal(clock(3909), "1:05:09");
  assert.equal(clock(36000 + 59), "10:00:59");
  assert.equal(clock(-5), "0:00:00");
  assert.deepEqual([spent(0), spent(30), spent(59), spent(60), spent(2700), spent(3600), spent(7500), spent(36000)], ["0m", "30s", "59s", "1m", "45m", "1h 00m", "2h 05m", "10h 00m"]);
});

test("a session counts on the day it started, on the clock of your time zone", () => {
  assert.equal(dayOf("2026-10-17T19:30:00Z", "Asia/Dhaka"), "2026-10-18"); // 01:30 the next morning in Dhaka
  assert.equal(dayOf("2026-10-17T19:30:00Z", "UTC"), "2026-10-17");
  assert.equal(dayOf("2026-10-17T19:30:00Z", "Not/AZone"), "2026-10-18");
});

const projects = [{ id: "a", name: "CRM", color: "blue" }, { id: "b", name: "Blog", color: "green" }, { id: "c", name: "Unused", color: "red" }];
const rows: TimeRow[] = [
  { project_id: "a", started_at: "2026-10-18T04:00:00Z", ended_at: "2026-10-18T05:00:00Z" }, // today, 1h
  { project_id: "a", started_at: "2026-10-16T04:00:00Z", ended_at: "2026-10-16T04:30:00Z" }, // 2 days ago, 30m
  { project_id: "a", started_at: "2026-09-01T04:00:00Z", ended_at: "2026-09-01T06:00:00Z" }, // long ago, 2h
  { project_id: "b", started_at: "2026-10-17T04:00:00Z", ended_at: "2026-10-17T04:10:00Z" }, // yesterday, 10m
  { project_id: "gone", started_at: "2026-10-18T04:00:00Z", ended_at: "2026-10-18T09:00:00Z" }, // a project that no longer exists
];

test("time per project and per day: this week, all time, today, and projects with no time are not listed", () => {
  const sum = summariseTime(rows, projects, "2026-10-18", "Asia/Dhaka", 7, T("2026-10-18T10:00:00Z"));
  assert.deepEqual(sum.days, ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]);
  assert.deepEqual(sum.projects.map((p) => [p.name, p.week_seconds, p.total_seconds]), [["CRM", 5400, 12600], ["Blog", 600, 600]]);
  assert.deepEqual(sum.projects[0].by_day, [0, 0, 0, 0, 1800, 0, 3600]);
  assert.deepEqual([sum.today_seconds, sum.week_seconds, sum.total_seconds, sum.running], [3600, 6000, 13200, null]);
});

test("a running timer is counted up to now and reported, and the summary says what time the server read", () => {
  const withRunning: TimeRow[] = [...rows, { project_id: "b", started_at: "2026-10-18T09:00:00Z", ended_at: null }];
  const sum = summariseTime(withRunning, projects, "2026-10-18", "Asia/Dhaka", 7, T("2026-10-18T09:30:00Z"));
  assert.deepEqual(sum.running, { project_id: "b", name: "Blog", started_at: "2026-10-18T09:00:00Z" });
  assert.equal(sum.projects.find((p) => p.id === "b")!.by_day[6], 1800);
  assert.equal(sum.now, "2026-10-18T09:30:00.000Z");
});

test("the state of one project: finished time and today's share, plus a running timer wherever it is", () => {
  const own = rows.filter((r) => r.project_id === "a");
  const idle = projectState(own, "a", "", "2026-10-18", "Asia/Dhaka", T("2026-10-18T10:00:00Z"));
  assert.deepEqual([idle.closed_seconds, idle.today_closed_seconds, idle.running], [12600, 3600, null]);
  const elsewhere = projectState([...own, { project_id: "b", started_at: "2026-10-18T09:00:00Z", ended_at: null }], "a", "Blog", "2026-10-18", "Asia/Dhaka", T("2026-10-18T10:00:00Z"));
  assert.deepEqual(elsewhere.running, { project_id: "b", name: "Blog", started_at: "2026-10-18T09:00:00Z", started_today: true });
  assert.equal(elsewhere.closed_seconds, 12600, "time of the project that is running elsewhere is not added to this one");
});

// ---- start and pause, against a small stand-in database ----

type Row = Record<string, unknown>;
function fakeDb(tables: Record<string, Row[]>, opts: { uniqueRace?: boolean } = {}) {
  const log: string[] = [];
  const db = {
    from(name: string) {
      let rows = [...(tables[name] ?? [])];
      let action: "select" | "update" | "insert" = "select";
      let patch: Row = {};
      let inserted: Row | null = null;
      const q: Record<string, unknown> = {
        select: () => q,
        eq: (c: string, v: unknown) => { rows = rows.filter((r) => r[c] === v); return q; },
        is: (c: string, v: unknown) => { rows = rows.filter((r) => (r[c] ?? null) === v); return q; },
        not: (c: string, _op: string, v: unknown) => { rows = rows.filter((r) => (r[c] ?? null) !== v); return q; },
        order: () => q,
        range: (from: number, to: number) => Promise.resolve({ data: rows.slice(from, to + 1), error: null }),
        single: () => Promise.resolve({ data: rows[0], error: rows[0] ? null : { code: "PGRST116", message: "none" } }),
        maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
        update: (p: Row) => { action = "update"; patch = p; return q; },
        insert: (row: Row) => { action = "insert"; inserted = row; return q; },
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
          if (action === "update") {
            for (const r of rows) Object.assign(r, patch);
            log.push(`update ${name} ${JSON.stringify(patch)}`);
            return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
          }
          if (action === "insert") {
            log.push(`insert ${name}`);
            if (opts.uniqueRace) return Promise.resolve({ data: null, error: { code: "23505", message: "duplicate" } }).then(resolve, reject);
            tables[name].push({ ended_at: null, ...inserted! });
            return Promise.resolve({ data: null, error: null }).then(resolve, reject);
          }
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        },
      };
      return q;
    },
  } as unknown as Db;
  return { db, log };
}

const NOW = T("2026-10-18T10:00:00Z");

test("Start begins a timer; starting again on the same project changes nothing", async () => {
  const tables = { projects: [{ id: "a", name: "CRM", archived_at: null }, { id: "b", name: "Blog", archived_at: null }], project_time: [] as Row[] };
  const { db, log } = fakeDb(tables);
  await startTimer(db, "a", NOW);
  assert.deepEqual(tables.project_time.map((r) => [r.project_id, r.ended_at]), [["a", null]]);
  await startTimer(db, "a", NOW + 5000);
  assert.equal(tables.project_time.length, 1);
  assert.equal(log.filter((l) => l.startsWith("insert")).length, 1);
});

test("starting another project pauses the first one (one timer at a time)", async () => {
  const tables = { projects: [{ id: "a", name: "CRM", archived_at: null }, { id: "b", name: "Blog", archived_at: null }], project_time: [{ project_id: "a", started_at: "2026-10-18T08:00:00.000Z", ended_at: null }] as Row[] };
  const { db } = fakeDb(tables);
  await startTimer(db, "b", NOW);
  assert.deepEqual(tables.project_time.map((r) => [r.project_id, r.ended_at]), [["a", "2026-10-18T10:00:00.000Z"], ["b", null]]);
});

test("a timer left running for more than 12 hours is cut at 12 hours when it is paused", async () => {
  const tables = { projects: [{ id: "a", name: "CRM", archived_at: null }], project_time: [{ project_id: "a", started_at: "2026-10-17T00:00:00.000Z", ended_at: null }] as Row[] };
  const { db } = fakeDb(tables);
  await pauseTimer(db, "a", NOW);
  assert.equal(tables.project_time[0].ended_at, "2026-10-17T12:00:00.000Z");
});

test("Pause only pauses a timer that runs on this project", async () => {
  const tables = { projects: [{ id: "a", name: "CRM", archived_at: null }], project_time: [{ project_id: "other", started_at: "2026-10-18T08:00:00.000Z", ended_at: null }] as Row[] };
  const { db, log } = fakeDb(tables);
  await pauseTimer(db, "a", NOW);
  assert.equal(tables.project_time[0].ended_at, null);
  assert.equal(log.length, 0);
});

test("an archived project cannot be timed, and two taps at once leave one running timer without an error", async () => {
  const archived = fakeDb({ projects: [{ id: "a", name: "CRM", archived_at: "2026-10-01T00:00:00Z" }], project_time: [] });
  await assert.rejects(() => startTimer(archived.db, "a", NOW), (e) => e instanceof HttpError && e.status === 400);
  const race = fakeDb({ projects: [{ id: "a", name: "CRM", archived_at: null }], project_time: [] }, { uniqueRace: true });
  await startTimer(race.db, "a", NOW); // the database refused the second timer: that is fine
});

test("the state answers with the time already spent and where the timer runs", async () => {
  const tables = {
    projects: [{ id: "a", name: "CRM", archived_at: null }, { id: "b", name: "Blog", archived_at: null }],
    project_time: [
      { project_id: "a", started_at: "2026-10-18T04:00:00.000Z", ended_at: "2026-10-18T05:00:00.000Z" },
      { project_id: "b", started_at: "2026-10-18T09:00:00.000Z", ended_at: null },
    ] as Row[],
  };
  const { db } = fakeDb(tables);
  const state = await timeState(db, "a", "Asia/Dhaka", "2026-10-18", NOW);
  assert.deepEqual([state.closed_seconds, state.today_closed_seconds, state.running?.project_id, state.running?.name], [3600, 3600, "b", "Blog"]);
});
