// When a task counts as today, upcoming or overdue. Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { isOnDay, isOverdue, isUpcoming, lastDay, taskDateLabel } from "../lib/tasks.ts";

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
