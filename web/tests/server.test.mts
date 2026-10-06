// Tests for the API's calculation helpers and sign-in check. Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import * as dates from "../lib/server/dates.ts";
import { currentStreak } from "../lib/server/streaks.ts";
import { byTime, occurrences } from "../lib/server/recurrence.ts";
import { habitBoard } from "../lib/server/habits.ts";
import { withProgress } from "../lib/server/goals.ts";
import { doneHours } from "../lib/course.ts";
import { errorResponse, HttpError } from "../lib/server/http.ts";
import { handle } from "../lib/server/api.ts";

test("date arithmetic works on plain YYYY-MM-DD dates", () => {
  assert.equal(dates.addDays("2026-10-01", -1), "2026-09-30");
  assert.equal(dates.addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(dates.addDays("2028-02-28", 1), "2028-02-29"); // leap year
  assert.equal(dates.daysBetween("2026-09-21", "2026-12-31"), 101);
  assert.equal(dates.weekdayIndex("2026-09-21"), 0); // Monday
  assert.equal(dates.weekdayIndex("2026-09-27"), 6); // Sunday
  assert.equal(dates.mondayOf("2026-10-01"), "2026-09-28");
  assert.deepEqual(dates.monthRange("2026-02"), { first: "2026-02-01", last: "2026-02-28" });
});

test('"today" follows the user time zone, not the server', () => {
  // 20:30 UTC on 30 Sep is already 1 Oct (02:30) in Dhaka.
  const moment = new Date("2026-09-30T20:30:00Z");
  assert.equal(dates.dateIn(moment, "Asia/Dhaka"), "2026-10-01");
  assert.equal(dates.dateIn(moment, "UTC"), "2026-09-30");
  assert.equal(dates.dateIn(moment, "Not/AZone"), "2026-10-01"); // falls back to Asia/Dhaka
  assert.equal(dates.startOfDayUtc("2026-10-01", "Asia/Dhaka"), "2026-09-30T18:00:00.000Z");
  assert.equal(dates.startOfDayUtc("2026-10-01", "UTC"), "2026-10-01T00:00:00.000Z");
});

test("streak counts back from today, or from yesterday while today is open", () => {
  const today = "2026-10-01";
  const days = (...offsets: number[]) => new Set(offsets.map((n) => dates.addDays(today, -n)));
  assert.equal(currentStreak(days(0, 1, 2, 3, 4, 5, 6, 7), today), 8);
  assert.equal(currentStreak(days(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12), today), 12); // today not ticked yet
  assert.equal(currentStreak(days(1, 2, 3, 5, 6), today), 3); // gap on day 4
  assert.equal(currentStreak(days(2, 3), today), 0); // yesterday missed
  assert.equal(currentStreak(new Set(), today), 0);
});

test("repeating events expand into each day of the range", () => {
  const once = { event_date: "2026-10-03", repeat: "none", repeat_until: null };
  assert.deepEqual(occurrences(once, "2026-10-01", "2026-10-31"), ["2026-10-03"]);
  assert.deepEqual(occurrences(once, "2026-10-04", "2026-10-31"), []);

  const daily = { event_date: "2026-09-28", repeat: "daily", repeat_until: "2026-10-02" };
  assert.deepEqual(occurrences(daily, "2026-10-01", "2026-10-31"), ["2026-10-01", "2026-10-02"]);

  const weekly = { event_date: "2026-09-21", repeat: "weekly", repeat_until: null };
  assert.deepEqual(occurrences(weekly, "2026-10-01", "2026-10-20"), ["2026-10-05", "2026-10-12", "2026-10-19"]);
  assert.deepEqual(occurrences(weekly, "2026-09-01", "2026-09-20"), []); // before it starts

  const items = [{ all_day: false, start_time: "13:00" }, { all_day: true, start_time: null }, { all_day: false, start_time: "07:00" }];
  assert.deepEqual(items.sort(byTime).map((e) => e.start_time), [null, "07:00", "13:00"]);
});

test("habit board matches the template numbers", () => {
  const today = "2026-10-01";
  const habits = [
    { id: "ex", name: "Exercise" }, { id: "rd", name: "Read" }, { id: "me", name: "Meditate" },
    { id: "wa", name: "Drink Water" }, { id: "eh", name: "Eat Healthy" }, { id: "sl", name: "Sleep Before 11" },
  ];
  const runs: Record<string, [number, number]> = { ex: [1, 12], rd: [0, 7], wa: [0, 20], eh: [1, 14] };
  const logs: { habit_id: string; log_date: string }[] = [];
  for (const [id, [from, to]] of Object.entries(runs)) for (let d = from; d <= to; d++) logs.push({ habit_id: id, log_date: dates.addDays(today, -d) });
  for (const d of [1, 2, 3, 5, 6, 7, 8, 9]) logs.push({ habit_id: "me", log_date: dates.addDays(today, -d) });
  for (const d of [1, 2, 5, 6, 7, 8]) logs.push({ habit_id: "sl", log_date: dates.addDays(today, -d) });

  const board = habitBoard(habits, logs, today, 7);
  assert.deepEqual(board.items.map((h) => h.streak), [12, 8, 3, 21, 14, 2]);
  assert.equal(board.summary.done_today, 2);
  assert.deepEqual(board.summary.best, { days: 21, name: "Drink Water" });
  assert.equal(board.summary.share, 83);
  assert.equal(board.summary.perfect_days, 4);
  assert.deepEqual(board.summary.needs_attention, { name: "Sleep Before 11", share: 57 });
  assert.equal(board.heatmap.length, 140);
  assert.equal(board.heatmap.at(-1)?.share, null); // Sunday after today is in the future
});

test("goal progress comes from values or milestones", () => {
  const fund = withProgress({
    current_value: 140000, target_value: 200000, progress_mode: "value",
    goal_milestones: [
      { at_value: 150000, done: false, position: 2 }, { at_value: 50000, done: false, position: 0 }, { at_value: 100000, done: false, position: 1 },
    ],
  });
  assert.equal(fund.percent, 70);
  assert.deepEqual(fund.milestones.map((m) => m.done), [true, true, false]); // sorted, ticked by value

  const skill = withProgress({
    current_value: 0, target_value: 1, progress_mode: "milestones",
    goal_milestones: [true, true, true, false, false].map((done, position) => ({ at_value: null, done, position })),
  });
  assert.equal(skill.percent, 60);
  assert.equal(withProgress({ current_value: 12, target_value: 10, progress_mode: "value" }).percent, 100); // capped
});

test("course topics count finished work, not more than the estimate", () => {
  const topic = (status: string, est: number, actual: number) => ({ status, est_hours: est, actual_hours: actual, planned_week: null });
  assert.equal(doneHours(topic("done", 3, 5)), 3);
  assert.equal(doneHours(topic("in-progress", 3, 1.5)), 1.5);
  assert.equal(doneHours(topic("in-progress", 3, 4)), 3);
  assert.equal(doneHours(topic("not-started", 2, 0)), 0);
});

test("API endpoints need a valid sign-in token", async () => {
  // A closed local port: any call to "Supabase" fails at once.
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:9";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-key";
  let reached = false;
  const endpoint = handle(async () => {
    reached = true;
    return {};
  });
  const call = (headers: Record<string, string>) =>
    endpoint(new Request("http://localhost/api/tasks", { headers }) as never, { params: Promise.resolve({}) });

  const none = await call({});
  assert.equal(none.status, 401);
  assert.deepEqual(await none.json(), { error: { message: "Please sign in." } });

  const bad = await call({ Authorization: "Bearer not-a-real-token" });
  assert.equal(bad.status, 401);
  assert.equal(reached, false);
});

test("errors become JSON, without server details in production", async () => {
  const field = errorResponse(new HttpError(400, "Please check the values you sent.", { fieldErrors: { title: ["Required"] } }));
  assert.equal(field.status, 400);
  assert.deepEqual((await field.json()).error.details, { fieldErrors: { title: ["Required"] } });

  const env = process.env as Record<string, string | undefined>;
  const before = env.NODE_ENV;
  env.NODE_ENV = "production";
  const original = console.error;
  console.error = () => {};
  try {
    const crash = errorResponse(new Error("secret stack"));
    assert.equal(crash.status, 500);
    assert.deepEqual(await crash.json(), { error: { message: "Something went wrong. Please try again." } });
    const db = errorResponse(new HttpError(500, "Something went wrong with the database.", "raw postgres message"));
    assert.equal((await db.json()).error.details, undefined);
  } finally {
    console.error = original;
    env.NODE_ENV = before;
  }
});
