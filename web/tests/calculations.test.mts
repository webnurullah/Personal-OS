// Run with: npm test   (Node runs TypeScript directly, no build needed)
import test from "node:test";
import assert from "node:assert/strict";
import { courseStats, courseWeeks, currentWeek, doneHours } from "../lib/course.ts";
import { monthTotals } from "../lib/finance.ts";

const topic = (code: string, est: number, week: number, status = "not-started", actual = 0) => ({ code, est_hours: est, planned_week: week, status, actual_hours: actual });

// The IQA course from the "Learning Details" design.
const units = [
  { id: "u1", topics: [topic("1.1", 3, 1, "done", 3), topic("1.2", 3, 1, "done", 3), topic("1.3", 3, 2, "in-progress", 1.5), topic("1.4", 3, 2), topic("1.5", 2, 3)] },
  { id: "u2", topics: [topic("2.1", 4, 4), topic("2.2", 3, 4), topic("2.3", 4, 5), topic("2.4", 3, 5), topic("2.5", 3, 6)] },
  { id: "u3", topics: [topic("3.1", 3, 7), topic("3.2", 3, 8), topic("3.3", 3, 8)] },
  { id: "u4", topics: [topic("4.1", 4, 9), topic("4.2", 4, 10), topic("4.3", 3, 10)] },
];
const course = { start_date: "2026-09-14", target_date: "2026-12-31", weekly_plan: [5, 5, 4, 4, 4, 4, 4, 3, 3, 3, 3, 3, 3, 3, 3, 3] };

test("course totals come from the topics", () => {
  const stats = courseStats(course, units, "2026-09-21");
  assert.equal(stats.total, 51);
  assert.equal(stats.done, 7.5);
  assert.equal(stats.left, 43.5);
  assert.equal(stats.progress, 15);
  assert.deepEqual(stats.units.map((u) => [u.est, u.percent]), [[14, 54], [17, 0], [9, 0], [11, 0]]);
  assert.equal(stats.thisWeek, 2);
  assert.deepEqual(stats.weekTopics.map((t) => t.code), ["1.3", "1.4"]);
  assert.deepEqual(stats.actualByWeek.slice(0, 3), [6, 1.5, 0]);
  assert.equal(stats.plannedTotal, 57);
  assert.equal(stats.weeks, 16);
  assert.equal(stats.daysLeft, 101);
  assert.equal(Math.round((stats.pace ?? 0) * 10) / 10, 3);
  assert.deepEqual(stats.ring, { done: 7.5, inProgress: 1.5, notStarted: 42 });
});

test("course week numbers stay inside the course", () => {
  assert.equal(courseWeeks(course), 16);
  assert.equal(currentWeek(course, "2026-09-01"), 1);
  assert.equal(currentWeek(course, "2027-03-01"), 16);
  assert.equal(doneHours({ status: "in-progress", est_hours: 3, actual_hours: 9, planned_week: 1 }), 3);
});

test("finance totals match the template month", () => {
  const categories = [
    { id: "housing", monthly_limit: 18000, is_savings: false },
    { id: "food", monthly_limit: 12000, is_savings: false },
    { id: "savings", monthly_limit: 15000, is_savings: true },
  ];
  const totals = monthTotals(categories, [
    { type: "income", amount: 75000, budget_category_id: null },
    { type: "expense", amount: 13900, budget_category_id: "housing" },
    { type: "expense", amount: 2350, budget_category_id: "food" },
    { type: "expense", amount: 9000, budget_category_id: "savings" },
    { type: "expense", amount: 500, budget_category_id: null },
  ]);
  assert.equal(totals.income, 75000);
  assert.equal(totals.outgoing, 25750);
  assert.equal(totals.saved, 9000);
  assert.equal(totals.spent, 16750);
  assert.equal(totals.budget, 45000);
  assert.equal(totals.left, 19250);
  assert.equal(totals.uncategorized, 500);
  assert.deepEqual(totals.rows.map((r) => r.spent), [13900, 2350, 9000]);
});
