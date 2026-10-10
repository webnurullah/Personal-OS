// Learning → progress and time by week, month and quarter. Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { buildProgress, PERIOD_COUNTS, paceDiff, periodOf, periodsEndingAt, progressFrom, summarisePeriod, type ProgressInput } from "../lib/progress.ts";
import { addDays, daysBetween } from "../lib/dates.ts";
import { learningProgress } from "../lib/server/progress.ts";
import type { Db } from "../lib/server/supabase.ts";

test("a week runs Monday to Sunday, a month is the calendar month, a quarter is three months", () => {
  assert.deepEqual(periodOf("week", "2026-10-08"), { kind: "week", start: "2026-10-05", end: "2026-10-11", label: "Oct 5 – Oct 11", short: "Oct 5" });
  assert.deepEqual(periodOf("month", "2026-10-08"), { kind: "month", start: "2026-10-01", end: "2026-10-31", label: "October 2026", short: "Oct" });
  const q = periodOf("quarter", "2026-10-08");
  assert.deepEqual([q.start, q.end, q.short], ["2026-10-01", "2026-12-31", "Q4"]);
  assert.equal(q.label, "Q4 2026 (Oct – Dec)");
});

test("month and quarter edges: leap February, 30-day months, the first and last day of a quarter", () => {
  assert.equal(periodOf("month", "2028-02-10").end, "2028-02-29");
  assert.equal(periodOf("month", "2026-02-10").end, "2026-02-28");
  assert.equal(periodOf("month", "2026-04-30").end, "2026-04-30");
  assert.deepEqual([periodOf("quarter", "2026-03-31").short, periodOf("quarter", "2026-04-01").short], ["Q1", "Q2"]);
  assert.equal(periodOf("quarter", "2026-03-31").end, "2026-03-31");
  assert.equal(periodOf("quarter", "2026-06-15").end, "2026-06-30");
  assert.equal(periodOf("quarter", "2026-12-31").start, "2026-10-01");
  assert.equal(periodOf("week", "2026-10-11").start, "2026-10-05"); // Sunday is the last day of its week
  assert.equal(periodOf("week", "2026-10-12").start, "2026-10-12");
});

test("periods in a row end with the current one, have no gaps, and cross the new year", () => {
  for (const kind of ["week", "month", "quarter"] as const) {
    const list = periodsEndingAt(kind, "2027-01-20");
    assert.equal(list.length, PERIOD_COUNTS[kind]);
    assert.ok(list.at(-1)!.start <= "2027-01-20" && list.at(-1)!.end >= "2027-01-20", `${kind}: the last one holds the date`);
    for (let i = 1; i < list.length; i += 1) assert.equal(addDays(list[i - 1].end, 1), list[i].start, `${kind}: no gap before ${list[i].start}`);
  }
  assert.deepEqual(periodsEndingAt("month", "2027-01-20", 3).map((p) => p.short), ["Nov", "Dec", "Jan"]);
  assert.deepEqual(periodsEndingAt("quarter", "2027-01-20", 3).map((p) => [p.short, p.start]), [["Q3", "2026-07-01"], ["Q4", "2026-10-01"], ["Q1", "2027-01-01"]]);
});

const base: ProgressInput = {
  today: "2026-10-08", // Thursday
  weeklyGoal: 6,
  sessions: [
    { date: "2026-10-05", hours: 1.5, course_id: "A", library: false },
    { date: "2026-10-05", hours: 0.5, course_id: "A", library: false },
    { date: "2026-10-07", hours: 2, course_id: "B", library: false },
    { date: "2026-10-08", hours: 1, course_id: null, library: true },
    { date: "2026-09-30", hours: 3, course_id: "A", library: false }, // last month, last week
    { date: "2026-12-30", hours: 9, course_id: "A", library: false }, // later this quarter, not yet
  ],
  topicDays: ["2026-10-06", "2026-10-06", "2026-09-29", "2026-10-20"],
  itemDays: ["2026-10-02", "2026-10-08"],
  courseTitles: { A: "Digital Marketing", B: "SQL" },
};

test("a week: hours against the goal, study days, sessions, the average, what was finished", () => {
  const w = summarisePeriod(periodOf("week", base.today), base);
  assert.deepEqual([w.hours, w.goal, w.percent, w.sessions, w.study_days, w.avg_session], [5, 6, 83, 4, 3, 1.25]);
  assert.deepEqual([w.topics_done, w.items_done], [2, 1]);
  assert.equal(w.current, true);
  assert.deepEqual([w.days, w.elapsed_days], [7, 4]);
  assert.equal(w.expected, 3.5, "4 of 7 days gone: 6h x 4/7, to the quarter hour");
  assert.equal(paceDiff(w), 1.5);
});

test("the goal grows with the length of the period (the weekly goal times its weeks, to the half hour)", () => {
  assert.equal(summarisePeriod(periodOf("month", "2026-10-08"), base).goal, 26.5); // 31 days of 6h a week = 26.57
  assert.equal(summarisePeriod(periodOf("month", "2026-09-08"), base).goal, 25.5); // 30 days: 25.7
  assert.equal(summarisePeriod(periodOf("quarter", "2026-10-08"), base).goal, 79); // 92 days: 78.9
  assert.equal(summarisePeriod(periodOf("week", "2026-10-08"), { ...base, weeklyGoal: 0 }).percent, 0);
});

test("a month and a quarter only count their own days, and a past period is judged against its whole goal", () => {
  const m = summarisePeriod(periodOf("month", "2026-10-08"), base);
  assert.deepEqual([m.hours, m.sessions, m.study_days, m.topics_done, m.items_done], [5, 4, 3, 2, 2]);
  const last = summarisePeriod(periodOf("month", "2026-09-08"), base);
  assert.deepEqual([last.hours, last.current, last.expected, last.elapsed_days], [3, false, 25.5, 30]);
  assert.equal(summarisePeriod(periodOf("quarter", "2026-10-08"), base).hours, 5, "the 9h on Dec 30 is in the quarter but has not been studied yet");
});

test("a period that has not started has nothing elapsed", () => {
  const future = summarisePeriod(periodOf("week", "2026-10-15"), base);
  assert.deepEqual([future.current, future.elapsed_days, future.hours], [false, 0, 0]);
});

test("where the time went: courses by hours, then library items and other study; extra courses are folded together", () => {
  const w = summarisePeriod(periodOf("week", base.today), base);
  assert.deepEqual(w.shares.map((s) => [s.title, s.hours, s.course_id]), [["Digital Marketing", 2, "A"], ["SQL", 2, "B"], ["Library items", 1, null]]);
  // equal hours: by name
  assert.equal(w.courses_studied, 2);
  const ids = ["A", "B", "C", "D", "E", "F", "G"];
  const many: ProgressInput = {
    ...base,
    sessions: [
      ...ids.map((id, i) => ({ date: "2026-10-06", hours: i + 1, course_id: id, library: false })),
      { date: "2026-10-06", hours: 0.5, course_id: null, library: true },
      { date: "2026-10-06", hours: 0.25, course_id: "gone", library: false },
    ],
    courseTitles: Object.fromEntries(ids.map((id) => [id, `Course ${id}`])),
  };
  const m = summarisePeriod(periodOf("week", base.today), many);
  assert.equal(m.courses_studied, 7, "seven courses were studied, however many rows are shown");
  assert.deepEqual(m.shares.map((x) => x.title), ["Course G", "3 other courses", "Course F", "Course E", "Course D", "Library items", "Other study"] /* biggest first; the fold ties with F at 6h */);
  assert.equal(m.shares.find((x) => x.key === "more")!.hours, 6, "A+B+C = 1+2+3, and not the library or other study");
  assert.equal(m.shares.find((x) => x.key === "library")!.hours, 0.5);
  assert.equal(m.shares.find((x) => x.key === "other")!.hours, 0.25, "a deleted course's sessions are other study");
  // Five courses are all listed (nothing is folded for the sake of one row).
  const five = summarisePeriod(periodOf("week", base.today), { ...many, sessions: many.sessions.slice(0, 5) });
  assert.deepEqual(five.shares.map((x) => x.title), ["Course E", "Course D", "Course C", "Course B", "Course A"]);
});

test("only study that has happened counts: a session ticked for a day still to come waits for its day", () => {
  const input: ProgressInput = { ...base, today: "2026-10-06", sessions: [
    { date: "2026-10-05", hours: 2, course_id: "A", library: false },
    { date: "2026-10-06", hours: 1, course_id: "A", library: false },
    { date: "2026-10-09", hours: 2, course_id: "A", library: false },
    { date: "2026-12-30", hours: 9, course_id: "A", library: false },
  ], topicDays: ["2026-10-06", "2026-10-09"], itemDays: ["2026-10-10"] };
  const w = summarisePeriod(periodOf("week", input.today), input);
  assert.deepEqual([w.hours, w.study_days, w.elapsed_days, w.sessions, w.topics_done, w.items_done], [3, 2, 2, 2, 1, 0]);
  assert.ok(w.study_days <= w.elapsed_days);
  assert.equal(summarisePeriod(periodOf("quarter", input.today), input).hours, 3, "the 9h on Dec 30 is not studied yet");
});

test("a week with a goal of its own is judged against it; a month adds up the weeks it covers", () => {
  const input: ProgressInput = { ...base, weeklyGoal: 7, weekGoals: { "2026-10-05": 14 } };
  assert.equal(summarisePeriod(periodOf("week", "2026-10-08"), input).goal, 14);
  assert.equal(summarisePeriod(periodOf("week", "2026-10-15"), input).goal, 7, "another week has the weekly goal");
  // October 2026: Oct 1-4 belong to the week of Sep 28 (7h), Oct 5-11 to the week with 14h, then two weeks of 7h and Oct 26-31 (6 days of 7h): 4 + 14 + 7 + 7 + 6
  assert.equal(summarisePeriod(periodOf("month", "2026-10-08"), input).goal, 38);
  assert.equal(summarisePeriod(periodOf("month", "2026-10-08"), { ...input, weekGoals: {} }).goal, 31, "31 days at 7h a week = 31h");
});

test("the whole answer has 8 weeks, 6 months and 4 quarters, the current one last, and says where to read from", () => {
  const all = buildProgress(base);
  assert.deepEqual([all.week.length, all.month.length, all.quarter.length], [8, 6, 4]);
  assert.ok(all.week.at(-1)!.current && all.month.at(-1)!.current && all.quarter.at(-1)!.current);
  assert.equal(all.week.slice(0, -1).some((p) => p.current), false);
  const from = progressFrom(base.today);
  assert.equal(from, "2026-01-01", "four quarters back is the earliest start (Q1 2026)");
  assert.ok(daysBetween(from, base.today) > 7 * 8);
  assert.equal(all.quarter[0].start, from);
});

type Row = Record<string, unknown>;
function fakeDb(tables: Record<string, Row[]>) {
  return {
    from(name: string) {
      let rows = [...(tables[name] ?? [])];
      let columns: string[] | null = null;
      const shown = () => (columns ? rows.map((r) => Object.fromEntries(columns!.map((c) => [c, r[c]]))) : rows);
      const q: Record<string, unknown> = {
        select: (list = "*") => { columns = list === "*" ? null : list.split(",").map((c) => c.trim()); return q; },
        eq: (column: string, value: unknown) => { rows = rows.filter((r) => r[column] === value); return q; },
        gte: (column: string, value: string) => { rows = rows.filter((r) => String(r[column]) >= value); return q; },
        order: () => q,
        range: (from: number, to: number) => Promise.resolve({ data: shown().slice(from, to + 1), error: null }),
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve({ data: shown(), error: null }).then(resolve, reject),
      };
      return q;
    },
  } as unknown as Db;
}

test("the server reads the rows: a session is on its week's day, topics lead to courses, finished times are in your time zone", async () => {
  const db = fakeDb({
    courses: [{ id: "A", title: "Digital Marketing" }],
    course_topics: [
      { id: "t1", course_id: "A", status: "done", completed_at: "2026-10-05T20:30:00+00:00" }, // 02:30 on Oct 6 in Dhaka
      { id: "t2", course_id: "A", status: "in-progress", completed_at: null },
    ],
    study_blocks: [
      { id: "b1", week_start: "2026-10-05", weekday: 0, hours: "1.50", topic_id: "t1", resource_id: null, done: true },
      { id: "b2", week_start: "2026-10-05", weekday: 3, hours: "1.00", topic_id: null, resource_id: "r1", done: true },
      { id: "b3", week_start: "2026-10-05", weekday: 4, hours: "2.00", topic_id: "t2", resource_id: null, done: false }, // planned, not done
      { id: "b4", week_start: "2025-01-06", weekday: 0, hours: "4.00", topic_id: null, resource_id: null, done: true }, // long ago
    ],
    learning_resources: [{ id: "r1", status: "completed", completed_on: "2026-10-07" }, { id: "r2", status: "todo", completed_on: null }],
    study_weeks: [{ week_start: "2026-10-05", goal_hours: "12.00" }, { week_start: "2026-10-12", goal_hours: null }], // a week with a goal of its own, and one without
  });
  const progress = await learningProgress(db, "2026-10-08", "Asia/Dhaka", 6);
  const w = progress.week.at(-1)!;
  assert.deepEqual([w.hours, w.sessions, w.study_days], [2.5, 2, 2]);
  assert.equal(w.goal, 12, "the week has a goal of its own");
  assert.equal(progress.week.at(-2)!.goal, 6, "the weeks before use the weekly goal");
  assert.deepEqual(w.shares.map((s) => [s.title, s.hours]), [["Digital Marketing", 1.5], ["Library items", 1]]);
  assert.deepEqual([w.topics_done, w.items_done], [1, 1]);
  assert.equal(progress.quarter.at(-1)!.hours, 2.5);
  assert.equal(progress.quarter.every((p) => p.hours <= 2.5), true, "the session from 2025 is outside every period");
});
