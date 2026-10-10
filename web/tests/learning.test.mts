// Learning: course numbers, wording, date limits and the request schemas. Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { courseStats, courseWeeks, currentWeek, doneHours, MAX_COURSE_WEEKS, nextNumber, nextPosition, timeLeft } from "../lib/course.ts";
import { hm, num, plural } from "../lib/format.ts";
import { HttpError } from "../lib/server/http.ts";
import { checkDates, checkPlannedWeek, CourseFields, TopicFields, UnitFields } from "../lib/server/schemas.ts";

const topic = (code: string, est: number, week: number | null, status = "not-started", actual = 0) => ({ code, est_hours: est, planned_week: week, status, actual_hours: actual });
const course = { start_date: "2026-09-14", target_date: "2026-12-31", weekly_plan: [5, 5, 4] };
const bad = (status: number) => (e: unknown) => e instanceof HttpError && e.status === status;

test("a course with no units yet has zero numbers, not NaN", () => {
  const stats = courseStats(course, [], "2026-09-21");
  assert.deepEqual([stats.total, stats.done, stats.left, stats.progress, stats.pace], [0, 0, 0, 0, null]);
  assert.deepEqual(stats.ring, { done: 0, inProgress: 0, notStarted: 0 });
  assert.equal(stats.units.length, 0);
});

test("a unit with no topics counts as 0 hours and 0 percent", () => {
  const stats = courseStats(course, [{ id: "u1", topics: [] }, { id: "u2", topics: [topic("2.1", 4, 1)] }], "2026-09-21");
  assert.deepEqual(stats.units.map((u) => [u.est, u.percent]), [[0, 0], [4, 0]]);
});

test("on the target day there is no pace to compute and nothing is 'passed' yet", () => {
  const units = [{ id: "u1", topics: [topic("1.1", 3, 16)] }];
  const onTheDay = courseStats(course, units, "2026-12-31");
  assert.equal(onTheDay.daysLeft, 0);
  assert.equal(onTheDay.pace, null);
  assert.equal(timeLeft(onTheDay.daysLeft), "target date is today");
  assert.equal(courseStats(course, units, "2027-01-01").daysLeft, -1);
});

test("the weekly plan is cut or padded to the number of weeks the course has", () => {
  const stats = courseStats(course, [{ id: "u1", topics: [] }], "2026-09-14");
  assert.equal(stats.plan.length, stats.weeks);
  assert.deepEqual(stats.plan.slice(0, 4), [5, 5, 4, 0]);
  const long = courseStats({ ...course, weekly_plan: Array.from({ length: 40 }, () => 1) }, [{ id: "u1", topics: [] }], "2026-09-14");
  assert.equal(long.plan.length, 16); // the extra entries are ignored
});

test("a topic planned beyond the last week is not in any week of the course", () => {
  const units = [{ id: "u1", topics: [topic("1.1", 3, 99, "in-progress", 2), topic("1.2", 2, 16)] }];
  const stats = courseStats(course, units, "2026-12-30");
  assert.equal(stats.thisWeek, 16);
  assert.deepEqual(stats.weekTopics.map((t) => t.code), ["1.2"]);
  assert.equal(stats.actualByWeek.reduce((a, b) => a + b, 0), 0);
});

test("a not-started topic with logged hours still counts the hours as done (never more than the estimate)", () => {
  assert.equal(doneHours({ status: "not-started", est_hours: 3, actual_hours: 1.25, planned_week: 1 }), 1.25);
  assert.equal(doneHours({ status: "not-started", est_hours: 3, actual_hours: 9, planned_week: 1 }), 3);
  assert.equal(doneHours({ status: "done", est_hours: 3, actual_hours: 0, planned_week: 1 }), 3);
});

test("the course is one week long when the target is within the first week, and weeks never go below 1", () => {
  assert.equal(courseWeeks({ ...course, start_date: "2026-09-14", target_date: "2026-09-20" }), 1);
  assert.equal(courseWeeks({ ...course, start_date: "2026-09-14", target_date: "2026-09-21" }), 2);
  assert.equal(currentWeek({ ...course, target_date: "2026-09-20" }, "2026-12-01"), 1);
});

test("the next unit or topic number is never one that is already used", () => {
  assert.equal(nextNumber([]), 1);
  assert.equal(nextNumber(["1", "2", "3"]), 4);
  assert.equal(nextNumber(["1", "3"]), 4); // unit 2 was deleted: not 3 again
  assert.equal(nextNumber(["1.1", "1.3"]), 4); // topic 1.2 was deleted: not 1.3 again
  assert.equal(nextNumber(["2.1", "2.2"]), 3);
  assert.equal(nextNumber(["A", "B"]), 3); // not numbers: still more than how many there are
  assert.equal(nextNumber(["1", "A"]), 3);
});

test("a new item goes after the last position, even when others were deleted", () => {
  assert.equal(nextPosition([]), 0);
  assert.equal(nextPosition([0, 1, 2]), 3);
  assert.equal(nextPosition([0, 2, 5]), 6); // two were deleted: counting would give 3 and clash
});

test("how long is left is worded correctly on every day", () => {
  assert.equal(timeLeft(-5), "date passed");
  assert.equal(timeLeft(0), "target date is today");
  assert.equal(timeLeft(1), "1 day left");
  assert.equal(timeLeft(6), "6 days left");
  assert.equal(timeLeft(7), "1 week left");
  assert.equal(timeLeft(8), "2 weeks left");
  assert.equal(timeLeft(101), "15 weeks left");
  assert.equal(plural(1, "unit"), "1 unit");
  assert.equal(plural(0, "unit"), "0 units");
});

test("quarter hours show as they are", () => {
  assert.equal(num(0.25), "0.25");
  assert.equal(num(0.75), "0.75");
  assert.equal(num(1.25), "1.25");
  assert.equal(num(7.5), "7.5");
  assert.equal(num(7), "7");
  assert.equal(num(1 / 3), "0.33");
  assert.equal(hm(7.75), "7h 45m");
  assert.equal(hm(0.25), "15m");
  assert.equal(hm(2.5), "2h 30m");
});

test("course dates: the target comes after the start, the start snaps to a Monday, a course lasts at most 3 years", () => {
  assert.deepEqual(checkDates({ start_date: "2026-09-16", target_date: "2026-12-01" }), { start_date: "2026-09-14", target_date: "2026-12-01" });
  assert.throws(() => checkDates({ start_date: "2026-09-14", target_date: "2026-09-14" }), bad(400));
  assert.throws(() => checkDates({ start_date: "2026-09-14", target_date: "2026-09-01" }), bad(400));
  assert.throws(() => checkDates({ start_date: "2026-09-14", target_date: "2206-12-31" }), bad(400)); // a year typo
  // The last day a course may end on is the last day of its 156th week: that is exactly 156 weeks, never 157.
  const lastDay = new Date(Date.UTC(2026, 8, 14) + (MAX_COURSE_WEEKS * 7 - 1) * 86400000).toISOString().slice(0, 10);
  assert.doesNotThrow(() => checkDates({ start_date: "2026-09-14", target_date: lastDay }));
  assert.equal(courseWeeks({ start_date: "2026-09-14", target_date: lastDay, weekly_plan: [] }), MAX_COURSE_WEEKS);
  assert.throws(() => checkDates({ start_date: "2026-09-14", target_date: new Date(Date.parse(lastDay) + 86400000).toISOString().slice(0, 10) }), bad(400));
});

test("a change that sends only one date is checked against the saved other one", () => {
  const saved = { start_date: "2026-09-14", target_date: "2026-12-31" };
  assert.throws(() => checkDates({ target_date: "2026-09-01" }, saved), bad(400)); // before the saved start
  assert.throws(() => checkDates({ start_date: "2027-02-01" }, saved), bad(400)); // after the saved target
  assert.throws(() => checkDates({ target_date: "2206-12-31" }, saved), bad(400));
  assert.deepEqual(checkDates({ target_date: "2027-03-01" }, saved), { target_date: "2027-03-01" });
  assert.deepEqual(checkDates({ start_date: "2026-10-07" }, saved), { start_date: "2026-10-05" });
  assert.deepEqual(checkDates({}, saved), {}); // other fields only
});

test("a topic can only be planned in a week the course has", () => {
  const dates = { start_date: "2026-09-14", target_date: "2026-12-31" }; // 16 weeks
  assert.doesNotThrow(() => checkPlannedWeek(null, dates));
  assert.doesNotThrow(() => checkPlannedWeek(undefined, dates));
  assert.doesNotThrow(() => checkPlannedWeek(1, dates));
  assert.doesNotThrow(() => checkPlannedWeek(16, dates));
  assert.throws(() => checkPlannedWeek(17, dates), bad(400));
  assert.throws(() => checkPlannedWeek(2, { start_date: "2026-09-14", target_date: "2026-09-20" }), bad(400)); // a one-week course
});

test("learning requests: strict and bounded", () => {
  const ok = { title: "SQL", start_date: "2026-09-14", target_date: "2026-12-31" };
  assert.equal(CourseFields.safeParse(ok).success, true);
  assert.equal(CourseFields.safeParse({ ...ok, extra: 1 }).success, false);
  assert.equal(CourseFields.safeParse({ ...ok, weekly_plan: Array.from({ length: 157 }, () => 1) }).success, false);
  assert.equal(CourseFields.safeParse({ ...ok, weekly_plan: [81] }).success, false);
  // category: any words up to 60 letters (spaces tidied); status: active, paused or done
  assert.deepEqual(CourseFields.parse({ ...ok, category: "  Digital   Marketing " }).category, "Digital Marketing");
  assert.equal(CourseFields.safeParse({ ...ok, category: "x".repeat(61) }).success, false);
  assert.equal(CourseFields.safeParse({ ...ok, category: "" }).success, true, "no category is allowed");
  assert.equal(CourseFields.safeParse({ ...ok, status: "paused" }).success, true);
  assert.equal(CourseFields.safeParse({ ...ok, status: "finished" }).success, false);
  assert.equal(CourseFields.partial().safeParse({ status: "done" }).success, true, "a status alone can be sent");
  assert.equal(UnitFields.safeParse({ code: "1" }).success, true);
  assert.equal(UnitFields.safeParse({ code: "12345678901" }).success, false);
  const id = "11111111-1111-4111-8111-111111111111";
  const t = { unit_id: id, code: "1.1", title: "Joins", est_hours: 2 };
  assert.equal(TopicFields.safeParse(t).success, true);
  assert.equal(TopicFields.safeParse({ ...t, est_hours: 0 }).success, false);
  assert.equal(TopicFields.safeParse({ ...t, planned_week: 157 }).success, false);
  assert.equal(TopicFields.safeParse({ ...t, planned_week: null }).success, true);
});
