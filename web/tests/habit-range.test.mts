import test from "node:test";
import assert from "node:assert/strict";
import { MAX_RANGE_DAYS, presetWindow, windowDays, windowKey, windowList, windowProblem, windowTitle } from "../lib/habit-range.ts";
import { habitBoard } from "../lib/server/habits.ts";

const TODAY = "2026-10-27"; // a Tuesday

test("last 7 days ends today", () => {
  assert.deepEqual(presetWindow("7d", TODAY), { from: "2026-10-21", to: "2026-10-27" });
});

test("a week starts on the first weekday and stops at today while it is running", () => {
  assert.deepEqual(presetWindow("week", TODAY, 0, 1), { from: "2026-10-26", to: "2026-10-27" }); // Monday start
  assert.deepEqual(presetWindow("week", TODAY, 0, 0), { from: "2026-10-25", to: "2026-10-27" }); // Sunday start
  assert.deepEqual(presetWindow("week", TODAY, -1, 1), { from: "2026-10-19", to: "2026-10-25" }); // a finished week is whole
  assert.deepEqual(presetWindow("week", TODAY, -2, 1), { from: "2026-10-12", to: "2026-10-18" });
  assert.deepEqual(presetWindow("week", "2026-10-25", 0, 1), { from: "2026-10-19", to: "2026-10-25" }); // on the last day of the week
});

test("a month is the calendar month, whole when it has ended", () => {
  assert.deepEqual(presetWindow("month", TODAY), { from: "2026-10-01", to: "2026-10-27" });
  assert.deepEqual(presetWindow("month", TODAY, -1), { from: "2026-09-01", to: "2026-09-30" });
  assert.deepEqual(presetWindow("month", TODAY, -9), { from: "2026-01-01", to: "2026-01-31" });
  assert.deepEqual(presetWindow("month", TODAY, -10), { from: "2025-12-01", to: "2025-12-31" }); // across the year
  assert.equal(windowDays(presetWindow("month", "2028-03-31", -1)), 29); // February of a leap year
});

test("a window lists its days and counts both ends", () => {
  const w = { from: "2026-10-25", to: "2026-10-27" };
  assert.deepEqual(windowList(w), ["2026-10-25", "2026-10-26", "2026-10-27"]);
  assert.equal(windowDays(w), 3);
});

test("picked dates: both, in order, not after today, at most 92 days, not too old", () => {
  assert.equal(windowProblem({ from: "2026-10-01", to: "2026-10-27" }, TODAY), "");
  assert.equal(windowProblem({ from: "2026-10-27", to: "2026-10-27" }, TODAY), "");
  assert.match(windowProblem({ from: "", to: "2026-10-27" }, TODAY), /both dates/);
  assert.match(windowProblem({ from: "2026-10-20", to: "2026-10-10" }, TODAY), /before the start/);
  assert.match(windowProblem({ from: "2026-10-20", to: "2026-10-28" }, TODAY), /after today/);
  assert.equal(windowProblem({ from: "2026-07-28", to: TODAY }, TODAY), ""); // exactly 92 days
  assert.match(windowProblem({ from: "2026-07-27", to: TODAY }, TODAY), new RegExp(`at most ${MAX_RANGE_DAYS}`));
  assert.match(windowProblem({ from: "2025-08-01", to: "2025-08-10" }, TODAY), /400 days/);
});

test("titles and keys", () => {
  assert.equal(windowTitle("7d", presetWindow("7d", TODAY)), "Last 7 days");
  assert.equal(windowTitle("month", presetWindow("month", TODAY)), "October 2026");
  assert.equal(windowTitle("week", presetWindow("week", TODAY, -1, 1)), "Oct 19 – Oct 25");
  assert.equal(windowTitle("custom", { from: "2026-10-03", to: "2026-11-12" }), "Oct 3 – Nov 12");
  assert.equal(windowTitle("custom", { from: "2026-10-03", to: "2026-10-03" }), "Oct 3");
  assert.equal(windowKey("7d", presetWindow("7d", TODAY)), "/habits?days=7");
  assert.equal(windowKey("month", { from: "2026-10-01", to: "2026-10-27" }), "/habits?from=2026-10-01&to=2026-10-27");
});

test("the habit board for a range: share is the part of the range done; streak, today and the heatmap stay the same", () => {
  const habits = [{ id: "a", name: "Read" }, { id: "b", name: "Walk" }];
  const days = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-26", "2026-10-27"];
  const logs = [...days.slice(0, 2), ...days.slice(4)].map((log_date) => ({ habit_id: "a", log_date })).concat([{ habit_id: "b", log_date: "2026-10-02" }]);
  const board = habitBoard(habits, logs, TODAY, 7, 20, { from: "2026-10-01", to: "2026-10-04" });
  assert.deepEqual(board.days, ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
  assert.deepEqual(board.range, { from: "2026-10-01", to: "2026-10-04", days: 4 });
  const a = board.items[0];
  assert.deepEqual([a.done, a.share, a.streak], [[true, true, false, false], 50, 2]); // the streak is the current one (26th, 27th)
  assert.equal(board.items[1].share, 25);
  assert.equal(board.summary.done_today, 1); // Read was done today although today is not in the range
  assert.equal(board.summary.perfect_days, 1); // only the 2nd had both
  assert.equal(board.summary.share, 38); // 3 of 8 squares
  // Without a range it is the last N days as before.
  const last = habitBoard(habits, logs, TODAY, 3);
  assert.deepEqual(last.days, ["2026-10-25", "2026-10-26", "2026-10-27"]);
  assert.deepEqual(last.range, { from: "2026-10-25", to: "2026-10-27", days: 3 });
});
