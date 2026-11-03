// When a task counts as today, upcoming or overdue. Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { EVENT_DAYS_AHEAD, eventsForTaskList, isOnDay, isOverdue, isUpcoming, lastDay, taskDateLabel } from "../lib/tasks.ts";

const today = "2026-10-06"; // a Tuesday
const task = (due_date: string | null, end_date: string | null = null, done_at: string | null = null) => ({ due_date, end_date, done_at });

test("a one-day task is on its due date only", () => {
  const t = task("2026-10-06");
  assert.equal(isOnDay(t, today), true);
  assert.equal(isOnDay(t, "2026-10-07"), false);
  assert.equal(isOverdue(task("2026-10-05"), today), true);
  assert.equal(isOverdue(task("2026-10-05", null, "2026-10-05T10:00:00Z"), today), false); // done
  assert.equal(isUpcoming(task("2026-10-07"), today), true);
  assert.equal(lastDay(t), "2026-10-06");
});

test("a task with an end date is on every day of its range, and late only after it ends", () => {
  const trip = task("2026-10-04", "2026-10-08");
  assert.equal(isOnDay(trip, "2026-10-04"), true);
  assert.equal(isOnDay(trip, today), true);
  assert.equal(isOnDay(trip, "2026-10-08"), true);
  assert.equal(isOnDay(trip, "2026-10-09"), false);
  assert.equal(isOverdue(trip, today), false); // started before today, but still running
  assert.equal(isOverdue(trip, "2026-10-09"), true);
  assert.equal(isUpcoming(trip, today), false);
  assert.equal(lastDay(trip), "2026-10-08");
});

test("tasks without a date are never today, upcoming or overdue", () => {
  const t = task(null);
  assert.equal(isOnDay(t, today), false);
  assert.equal(isOverdue(t, today), false);
  assert.equal(isUpcoming(t, today), false);
});

test("date labels show ranges in a readable way", () => {
  assert.equal(taskDateLabel(task(null), today), "No date");
  assert.equal(taskDateLabel(task("2026-10-06"), today), "Today");
  assert.equal(taskDateLabel(task("2026-10-07"), today), "Tomorrow");
  assert.equal(taskDateLabel(task("2026-10-04", "2026-10-06"), today), "Ends today");
  assert.equal(taskDateLabel(task("2026-10-04", "2026-10-09"), today), "Ends Friday");
  assert.equal(taskDateLabel(task("2026-10-08", "2026-10-10"), today), "Oct 8 – Oct 10");
  assert.equal(taskDateLabel(task("2026-10-01", "2026-10-03"), today), "Oct 1 – Oct 3");
  assert.equal(taskDateLabel(task("2026-10-06", "2026-10-06"), today), "Today"); // same day = one-day task
});

test("events in the task list: today's, and each event once on its next day", () => {
  const e = (id: string, date: string, all_day = false, start_time: string | null = "10:00") => ({ id, date, all_day, start_time: all_day ? null : start_time });
  const today = "2026-11-03";
  const list = eventsForTaskList(
    [
      e("daily", "2026-11-03", false, "08:00"), e("daily", "2026-11-04", false, "08:00"), e("daily", "2026-11-05", false, "08:00"),
      e("weekly", "2026-11-10", false, "19:30"), e("weekly", "2026-11-17", false, "19:30"),
      e("allday", "2026-11-03", true), e("late", "2026-11-03", false, "21:00"),
      e("once", "2026-11-06", true), e("past", "2026-11-01", false, "09:00"),
    ],
    today,
  );
  assert.deepEqual(list.today.map((x) => x.id), ["allday", "daily", "late"], "all-day first, then by start time");
  assert.deepEqual(list.upcoming.map((x) => [x.id, x.date]), [["daily", "2026-11-04"], ["once", "2026-11-06"], ["weekly", "2026-11-10"]], "one line per event, the earliest day after today, in date order");
  assert.deepEqual(eventsForTaskList([], today), { today: [], upcoming: [] });
  assert.equal(EVENT_DAYS_AHEAD, 60);
});
