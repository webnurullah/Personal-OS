// Learning "Study next": what to study, behind or on track, pace and forecast, and the weekly streak. Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { addDays as addDaysIso, formatDate } from "../lib/dates.ts";
import { blockDate, courseHealth, forecastFinish, forecastText, weekNumber, hoursByWeek, hoursLeft, pickNext, rankTopics, reasonText, recentWeeks, sessionLabel, topicReason, weekStreak, weeklyPace, type DoneBlock, type StudyCourse, type StudyTopic } from "../lib/study.ts";

const TODAY = "2026-10-08"; // a Thursday
const A: StudyCourse = { id: "A", title: "Digital Marketing", start_date: "2026-09-14", target_date: "2026-12-06" }; // 12 weeks; today is in week 4
const B: StudyCourse = { id: "B", title: "SQL", start_date: "2026-10-01", target_date: "2026-11-30" }; // today is in week 2

let n = 0;
const topic = (course: string, o: Partial<StudyTopic> = {}): StudyTopic => ({
  id: `t${++n}`, course_id: course, unit_id: "u", code: `1.${n}`, title: `Topic ${n}`, status: "not-started",
  est_hours: 2, actual_hours: 0, planned_week: null, unit_position: 0, position: n, ...o,
});

test("why a topic is worth studying", () => {
  const t = (status: string, planned_week: number | null, actual_hours = 0) => ({ status, planned_week, est_hours: 2, actual_hours });
  assert.equal(topicReason(t("done", 1), 4), null);
  assert.equal(topicReason(t("not-started", 3), 4), "overdue");
  assert.equal(topicReason(t("in-progress", 3, 1), 4), "overdue");
  assert.equal(topicReason(t("not-started", 4), 4), "this-week");
  assert.equal(topicReason(t("in-progress", null, 1), 4), "in-progress");
  assert.equal(topicReason(t("in-progress", 6, 1), 4), "in-progress");
  assert.equal(topicReason(t("not-started", 6), 4), "next");
  assert.equal(topicReason(t("not-started", null), 4), "next");
  // All its hours are logged but it is not marked finished: not behind, just waiting to be ticked off.
  assert.equal(topicReason(t("in-progress", 1, 2), 4), "in-progress");
  assert.equal(topicReason(t("in-progress", 4, 3), 4), "in-progress");
});

test("hours left on a topic never go below zero", () => {
  assert.equal(hoursLeft({ status: "in-progress", est_hours: 3, actual_hours: 1 }), 2);
  assert.equal(hoursLeft({ status: "in-progress", est_hours: 3, actual_hours: 5 }), 0);
  assert.equal(hoursLeft({ status: "done", est_hours: 3, actual_hours: 0 }), 0);
  assert.equal(hoursLeft({ status: "not-started", est_hours: 0.25, actual_hours: 0 }), 0.25);
});

test("the list: what is behind first (oldest week first), then this week, then what you started, then the rest", () => {
  const a = {
    done: topic("A", { status: "done", planned_week: 1 }),
    late2: topic("A", { status: "in-progress", est_hours: 3, actual_hours: 1, planned_week: 2 }),
    late1: topic("A", { planned_week: 3 }),
    nowStarted: topic("A", { status: "in-progress", planned_week: 4 }),
    now: topic("A", { planned_week: 4 }),
    later: topic("A", { planned_week: 6 }),
    started: topic("A", { status: "in-progress" }),
  };
  const list = rankTopics([A], Object.values(a), TODAY);
  assert.deepEqual(list.map((i) => [i.topic.id, i.reason]), [
    [a.late2.id, "overdue"], [a.late1.id, "overdue"], [a.nowStarted.id, "this-week"], [a.now.id, "this-week"], [a.started.id, "in-progress"], [a.later.id, "next"],
  ]);
  assert.deepEqual(list.map((i) => i.weeksLate), [2, 1, 0, 0, 0, 0]);
  assert.equal(list[0].hoursLeft, 2);
  assert.equal(list.some((i) => i.topic.id === a.done.id), false, "a finished topic is never listed");
});

test("a course that has not started yet is left out; an ended course still lists what is unfinished", () => {
  const future: StudyCourse = { id: "F", title: "Later", start_date: "2026-11-02", target_date: "2027-01-31" };
  const ended: StudyCourse = { id: "E", title: "Over", start_date: "2026-06-01", target_date: "2026-08-30" };
  const list = rankTopics([future, ended], [topic("F"), topic("E", { planned_week: 2 }), topic("E")], TODAY);
  assert.deepEqual(list.map((i) => [i.course.id, i.reason]), [["E", "overdue"], ["E", "next"]]);
});

test("topics are studied in course order: units first, then the topic's place in its unit", () => {
  const second = topic("A", { unit_position: 1, position: 0, code: "2.1" });
  const first = topic("A", { unit_position: 0, position: 5, code: "1.6" });
  const early = topic("A", { unit_position: 0, position: 1, code: "1.2" });
  assert.deepEqual(rankTopics([A], [second, first, early], TODAY).map((i) => i.topic.id), [early.id, first.id, second.id]);
});

test("the few to show: not more than two from one course, three in all, between courses the earlier target first", () => {
  const a = [topic("A", { planned_week: 2 }), topic("A", { planned_week: 3 }), topic("A", { planned_week: 4 }), topic("A")];
  const b = [topic("B"), topic("B")];
  const ranked = rankTopics([A, B], [...a, ...b], TODAY);
  assert.deepEqual(ranked.map((i) => i.topic.id), [a[0].id, a[1].id, a[2].id, b[0].id, b[1].id, a[3].id].map((id) => id));
  assert.deepEqual(pickNext(ranked).map((i) => i.topic.id), [a[0].id, a[1].id, b[0].id]);
  assert.deepEqual(pickNext(ranked, 5, 1).map((i) => i.topic.id), [a[0].id, b[0].id]);
  assert.deepEqual(pickNext([]), []);
});

test("between courses, the topic that is most weeks late comes first (week numbers belong to each course)", () => {
  const far: StudyCourse = { id: "F", title: "Far along", start_date: "2026-08-03", target_date: "2026-12-27" }; // today is in week 10
  const near: StudyCourse = { id: "N", title: "Just begun", start_date: "2026-09-21", target_date: "2026-12-27" }; // today is in week 3
  const fiveLate = topic("F", { planned_week: 5 });
  const twoLate = topic("N", { planned_week: 1 });
  const list = rankTopics([near, far], [twoLate, fiveLate], TODAY);
  assert.deepEqual(list.map((i) => [i.topic.id, i.weeksLate]), [[fiveLate.id, 5], [twoLate.id, 2]]);
});

test("a course that is over keeps counting weeks: its last week's topics are late too", () => {
  const over: StudyCourse = { id: "O", title: "Over", start_date: "2026-06-01", target_date: "2026-08-23" }; // 12 weeks; today is in week 19
  const last = topic("O", { planned_week: 12 });
  const before = topic("O", { planned_week: 11 });
  const list = rankTopics([over], [before, last], TODAY);
  assert.deepEqual(list.map((i) => [i.topic.id, i.reason, i.weeksLate]), [[before.id, "overdue", 8], [last.id, "overdue", 7]]);
  assert.equal(weekNumber(over, TODAY), 19);
  assert.equal(weekNumber(over, "2026-06-01"), 1);
  assert.equal(weekNumber(over, "2026-06-07"), 1);
  assert.equal(weekNumber(over, "2026-06-08"), 2);
});

test("a topic with all its hours logged is neither listed as late nor makes the course behind", () => {
  const full = topic("A", { status: "in-progress", est_hours: 2, actual_hours: 2, planned_week: 1 });
  const [item] = rankTopics([A], [full], TODAY);
  assert.deepEqual([item.reason, item.hoursLeft, item.weeksLate], ["in-progress", 0, 0]);
  const h = courseHealth(A, [full, { status: "not-started", est_hours: 2, actual_hours: 0, planned_week: 9 }], TODAY);
  assert.equal(h.state, "on-track");
  // …but a topic that is late and still has hours does.
  assert.equal(courseHealth(A, [full, { status: "in-progress", est_hours: 2, actual_hours: 0.5, planned_week: 2 }], TODAY).behindHours, 1.5);
});

test("topics whose hours are all logged come after the ones that still have work left", () => {
  const full1 = topic("A", { status: "in-progress", est_hours: 2, actual_hours: 2 });
  const full2 = topic("A", { status: "in-progress", est_hours: 2, actual_hours: 2 });
  const open = topic("A", { status: "in-progress", est_hours: 3, actual_hours: 1 });
  const ranked = rankTopics([A], [full1, full2, open], TODAY);
  assert.deepEqual(ranked.map((i) => i.topic.id), [open.id, full1.id, full2.id]);
  assert.deepEqual(pickNext(ranked, 2, 2).map((i) => i.topic.id), [open.id, full1.id]);
});

test("how a reason reads", () => {
  assert.equal(reasonText({ reason: "overdue", weeksLate: 1 }), "1 week behind");
  assert.equal(reasonText({ reason: "overdue", weeksLate: 3 }), "3 weeks behind");
  assert.equal(reasonText({ reason: "this-week", weeksLate: 0 }), "planned for this week");
  assert.equal(reasonText({ reason: "in-progress", weeksLate: 0 }), "already started");
  assert.equal(reasonText({ reason: "next", weeksLate: 0 }), "next in the course");
});

test("course health: empty, done, not started, over, on track", () => {
  assert.equal(courseHealth(A, [], TODAY).state, "empty");
  assert.equal(courseHealth(A, [{ status: "not-started", est_hours: 0.01, actual_hours: 0, planned_week: 1 }].slice(0, 0), TODAY).state, "empty");
  assert.equal(courseHealth(A, [{ status: "done", est_hours: 2, actual_hours: 0, planned_week: 1 }], TODAY).state, "done");
  assert.equal(courseHealth(A, [{ status: "not-started", est_hours: 2, actual_hours: 0, planned_week: 1 }], "2026-09-01").state, "not-started");
  const over = courseHealth(A, [{ status: "done", est_hours: 2, actual_hours: 0, planned_week: 1 }, { status: "in-progress", est_hours: 4, actual_hours: 1, planned_week: 3 }], "2026-12-07");
  assert.deepEqual([over.state, over.behindHours], ["overdue", 3]);
  assert.equal(courseHealth(A, [{ status: "in-progress", est_hours: 2, actual_hours: 1, planned_week: 4 }, { status: "not-started", est_hours: 2, actual_hours: 0, planned_week: 9 }], TODAY).state, "on-track");
});

test("course health: behind means something planned for an earlier week is not finished", () => {
  const h = courseHealth(A, [
    { status: "done", est_hours: 2, actual_hours: 0, planned_week: 1 },
    { status: "in-progress", est_hours: 3, actual_hours: 1, planned_week: 2 },
    { status: "not-started", est_hours: 1.5, actual_hours: 0, planned_week: 3 },
    { status: "not-started", est_hours: 2, actual_hours: 0, planned_week: 4 },
  ], TODAY);
  assert.deepEqual(h, { state: "behind", behindHours: 3.5, weeksBehind: 2 });
});

test("course health without a weekly plan is judged by time: ahead of what is done by 15% of the course, and 2 hours", () => {
  // Course B: 61 days; today (Oct 8) is 7 days in, so 7/61 of the work should be done.
  const mk = (done: number) => [{ status: "in-progress", est_hours: 100, actual_hours: done, planned_week: null }];
  assert.equal(courseHealth(B, mk(5), TODAY).state, "on-track"); // expected 11.5h, behind by 6.5 < 15
  const behind = courseHealth(B, [{ status: "in-progress", est_hours: 100, actual_hours: 0, planned_week: null }], "2026-10-15"); // 14 days in: expected 22.9h
  assert.deepEqual([behind.state, behind.behindHours], ["behind", 22.95]);
  // A tiny course: two hours behind is enough to count, less is not.
  assert.equal(courseHealth(B, [{ status: "not-started", est_hours: 4, actual_hours: 0, planned_week: null }], "2026-10-15").state, "on-track"); // expected 0.92h
  assert.equal(courseHealth(B, [{ status: "not-started", est_hours: 6, actual_hours: 0, planned_week: null }], "2026-11-01").state, "behind");
  // A plan on any topic turns the time rule off: nothing planned earlier than now is open, so it is on track.
  assert.equal(courseHealth(B, [{ status: "not-started", est_hours: 100, actual_hours: 0, planned_week: 5 }], "2026-10-15").state, "on-track");
});

const block = (date: string, hours: number, topicId: string | null = "t"): DoneBlock => {
  const monday = new Date(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)));
  const index = (monday.getUTCDay() + 6) % 7;
  const start = new Date(monday.getTime() - index * 86400000).toISOString().slice(0, 10);
  return { week_start: start, weekday: index, hours, topic_id: topicId };
};

test("a session's own date comes from its week and weekday", () => {
  assert.equal(blockDate({ week_start: "2026-10-05", weekday: 3 }), "2026-10-08");
  assert.equal(blockDate(block("2026-10-11", 1)), "2026-10-11");
});

test("pace: the last 4 weeks of sessions on the course's topics, a newcomer is not averaged against empty weeks", () => {
  const mine = new Set(["t"]);
  const blocks = [block("2026-09-11", 5), block("2026-09-14", 4), block("2026-10-01", 4), block("2026-10-08", 4), block("2026-10-02", 3, "other"), block("2026-10-03", 9, null), block("2026-10-10", 7)];
  // In the window 2026-09-11 … 2026-10-08: 5 + 4 + 4 + 4 = 17h over 4 weeks (the first session is 28 days back, counting today).
  assert.equal(weeklyPace(blocks, mine, TODAY), 17 / 4);
  // Started this week: 3h on Tuesday and 3h on Thursday = 6h over 3 days, which counts as one week.
  assert.equal(weeklyPace([block("2026-10-06", 3), block("2026-10-08", 3)], mine, TODAY), 6);
  assert.equal(weeklyPace([], mine, TODAY), null);
  assert.equal(weeklyPace([block("2026-08-01", 5)], mine, TODAY), null, "too long ago");
  assert.equal(weeklyPace([block("2026-10-03", 3, "other")], mine, TODAY), null, "other courses do not count");
});

test("forecast: when the course ends at this pace, and how late", () => {
  assert.deepEqual(forecastFinish(14, 7, TODAY, "2026-12-06"), { date: "2026-10-22", daysLate: -45 });
  assert.deepEqual(forecastFinish(20, 2, "2026-10-08", "2026-12-06"), { date: "2026-12-17", daysLate: 11 });
  assert.deepEqual(forecastFinish(1, 100, TODAY, "2026-10-08"), { date: "2026-10-09", daysLate: 1 }, "at least a day");
  assert.equal(forecastFinish(0, 5, TODAY, "2026-12-06"), null);
  assert.equal(forecastFinish(10, null, TODAY, "2026-12-06"), null);
  assert.equal(forecastFinish(10, 0, TODAY, "2026-12-06"), null);
  assert.equal(forecastFinish(500, 0.5, TODAY, "2026-12-06"), null, "more than 3 years away is not a forecast");
});

test("the forecast in words", () => {
  assert.equal(forecastText({ date: "2026-12-01", days_late: -5 }), `At your pace: done by ${formatDate("2026-12-01", "date")} (on time)`);
  assert.equal(forecastText({ date: "2026-12-06", days_late: 0 }), `At your pace: done by ${formatDate("2026-12-06", "date")} (on time)`);
  assert.match(forecastText({ date: "2026-12-07", days_late: 1 }), /\(1 day after the target\)$/);
  assert.match(forecastText({ date: "2026-12-20", days_late: 14 }), /\(14 days after the target\)$/);
});

test("streak: weeks in a row with some study; a quiet week so far does not break it", () => {
  const byWeek = hoursByWeek([
    { week_start: "2026-09-14", hours: 2 }, { week_start: "2026-09-21", hours: 1 }, { week_start: "2026-09-21", hours: 1.5 },
    { week_start: "2026-09-28", hours: 3 }, { week_start: "2026-10-05", hours: 0.5 },
  ]);
  assert.equal(byWeek.get("2026-09-21"), 2.5);
  assert.equal(weekStreak(byWeek, "2026-10-05"), 4);
  assert.equal(weekStreak(byWeek, "2026-10-12"), 4, "next Monday, nothing yet: still alive from last week");
  assert.equal(weekStreak(byWeek, "2026-10-19"), 0, "a whole week missed");
  assert.equal(weekStreak(new Map(), "2026-10-05"), 0);
  assert.equal(weekStreak(hoursByWeek([{ week_start: "2026-09-14", hours: 2 }, { week_start: "2026-10-05", hours: 2 }]), "2026-10-05"), 1, "a gap ends it");
});

test("the last 8 weeks, oldest first, with 0 for a quiet week", () => {
  const weeks = recentWeeks(hoursByWeek([{ week_start: "2026-10-05", hours: 2.5 }, { week_start: "2026-09-21", hours: 1 }, { week_start: "2026-05-04", hours: 9 }]), "2026-10-05");
  assert.equal(weeks.length, 8);
  assert.deepEqual([weeks[0].week_start, weeks[7].week_start], ["2026-08-17", "2026-10-05"]);
  assert.deepEqual(weeks.map((w) => w.hours), [0, 0, 0, 0, 0, 1, 0, 2.5]);
});

test("the text a session gets from its topic", () => {
  assert.equal(sessionLabel({ code: "2.1", title: "SQL joins" }), "2.1 SQL joins");
  assert.equal(sessionLabel({ code: "", title: "SQL joins" }), "SQL joins");
  assert.equal(sessionLabel({ code: "1.1", title: "x".repeat(400) }).length, 200);
});

// ---------- The server side: the overview the Learning page is given, and the checks on a session's links ----------
import { HttpError } from "../lib/server/http.ts";
import { checkBlockLinks, studyOverview } from "../lib/server/study.ts";
import { summariseCourses } from "../lib/server/queries.ts";
import { BlockCreate } from "../lib/server/schemas.ts";
import type { Db } from "../lib/server/supabase.ts";

type Row = Record<string, unknown>;
/** Just enough of the database client for these reads: select, eq, gte, order, limit, range, maybeSingle. */
function fakeDb(tables: Record<string, Row[]>, failing: string[] = []) {
  return {
    from(name: string) {
      let rows = [...(tables[name] ?? [])];
      let columns: string[] | null = null;
      const shown = () => (columns ? rows.map((r) => Object.fromEntries(columns!.map((c) => [c, r[c]]))) : rows);
      const q: Record<string, unknown> = {
        select: (list = "*") => { columns = list === "*" ? null : list.split(",").map((c) => c.trim()); return q; },
        eq: (column: string, value: unknown) => { rows = rows.filter((r) => r[column] === value); return q; },
        gte: (column: string, value: string) => { rows = rows.filter((r) => String(r[column]) >= value); return q; },
        lt: (column: string, value: string) => { rows = rows.filter((r) => String(r[column]) < value); return q; },
        lte: (column: string, value: string) => { rows = rows.filter((r) => String(r[column]) <= value); return q; },
        order: () => q,
        limit: (count: number) => { rows = rows.slice(0, count); return q; },
        range: (from: number, to: number) => Promise.resolve({ data: shown().slice(from, to + 1), error: null }),
        maybeSingle: () => Promise.resolve(failing.includes(name) ? { data: null, error: { code: "08006", message: "connection lost" } } : { data: shown()[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve({ data: shown(), error: null }).then(resolve, reject),
      };
      return q;
    },
  } as unknown as Db;
}

const row = (id: string, course: string, unit: string, code: string, o: Row = {}): Row => ({
  id, course_id: course, unit_id: unit, code, title: `Topic ${code}`, est_hours: 2, actual_hours: 0, status: "not-started", planned_week: null, position: 0, ...o,
});
const courseRows: Row[] = [
  { id: "A", title: "Digital Marketing", subtitle: "", start_date: "2026-09-14", target_date: "2026-12-06", color: "indigo" },
  { id: "B", title: "SQL", subtitle: "", start_date: "2026-10-01", target_date: "2026-11-30", color: "teal" },
];
const topicRows: Row[] = [
  row("a1", "A", "u2", "2.1", { position: 0, planned_week: 3 }), // behind by one week, in the second unit
  row("a2", "A", "u1", "1.1", { position: 0, status: "done", planned_week: 1 }),
  row("a3", "A", "u1", "1.2", { position: 1, status: "in-progress", actual_hours: 0.5, planned_week: 4 }),
  row("b1", "B", "u3", "1.1", { est_hours: 10 }),
];
const unitRows: Row[] = [{ id: "u1", course_id: "A", position: 0 }, { id: "u2", course_id: "A", position: 1 }, { id: "u3", course_id: "B", position: 0 }];

test("the overview: what to study next, the topics to pick from, behind or not, the forecast and the streak", async () => {
  const db = fakeDb({
    courses: courseRows, course_topics: topicRows, course_units: unitRows,
    study_blocks: [
      { id: "s1", week_start: "2026-10-05", weekday: 1, hours: 2, topic_id: "a2", done: true },
      { id: "s2", week_start: "2026-09-28", weekday: 3, hours: 2, topic_id: "a3", done: true },
      { id: "s3", week_start: "2026-09-21", weekday: 0, hours: 1, topic_id: null, done: true },
      { id: "s4", week_start: "2026-09-07", weekday: 0, hours: 1, topic_id: null, done: true },
    ],
    learning_resources: [{ id: "r1", title: "SQL playlist", status: "learning" }, { id: "r2", title: "Done one", status: "completed" }],
  });
  const o = await studyOverview(db, TODAY);

  assert.deepEqual(o.study_next.map((i) => [i.topic_id, i.reason, i.weeks_late]), [["a1", "overdue", 1], ["a3", "this-week", 0], ["b1", "next", 0]]);
  assert.deepEqual(o.study_next[1], { topic_id: "a3", course_id: "A", course_title: "Digital Marketing", course_color: "indigo", code: "1.2", title: "Topic 1.2", status: "in-progress", est_hours: 2, hours_left: 1.5, planned_week: 4, reason: "this-week", weeks_late: 0 });
  assert.deepEqual(o.open_topics.map((t) => [t.id, t.label]), [["a1", "2.1 Topic 2.1"], ["a3", "1.2 Topic 1.2"], ["b1", "1.1 Topic 1.1"]]);
  assert.deepEqual(o.library, [{ id: "r1", title: "SQL playlist" }]);

  const [a, b] = o.courses;
  assert.deepEqual([a.state, a.behind_hours, a.weeks_behind], ["behind", 2, 1]);
  assert.equal(b.state, "on-track");
  // Course A: 4h finished on its topics in the last 4 weeks; the first of them 11 days ago (a2 on Oct 6 is 2 days ago, a3 on Oct 1 is 7 days ago).
  assert.ok(a.forecast && a.forecast.date > TODAY, JSON.stringify(a.forecast));
  assert.equal(b.forecast, null, "no session on its topics yet, so no forecast");

  // Weeks: Sep 7 (1h), Sep 21 (1h), Sep 28 (2h), Oct 5 (2h): a gap before Sep 21, then three in a row.
  assert.equal(o.stats.streak, 3);
  assert.deepEqual(o.stats.weeks.map((w) => w.hours), [0, 0, 0, 1, 0, 1, 2, 2]);
});

test("a course's numbers say whether it is behind", () => {
  const [a, b] = summariseCourses({ courses: courseRows as never, topics: topicRows as never, units: unitRows as never }, TODAY);
  assert.deepEqual([a.state, a.weeks_behind, a.behind_hours, a.percent], ["behind", 1, 2, 42]);
  assert.deepEqual([b.state, b.topic_count, b.unit_count], ["on-track", 1, 1]);
});

test("a session may only name a topic and a library item that are yours", async () => {
  const db = fakeDb({ course_topics: [{ id: "T1" }], learning_resources: [{ id: "R1" }] });
  await checkBlockLinks(db, {});
  await checkBlockLinks(db, { topic_id: null, resource_id: null });
  await checkBlockLinks(db, { topic_id: "T1", resource_id: "R1" });
  const refused = (status: number, message: RegExp) => (e: unknown) => e instanceof HttpError && e.status === status && message.test(e.message);
  await assert.rejects(checkBlockLinks(db, { topic_id: "nope" }), refused(400, /topic/));
  await assert.rejects(checkBlockLinks(db, { resource_id: "nope" }), refused(400, /library/));
});

test("a session's request: topic and library item are optional ids (or null to unlink)", () => {
  const base = { week_start: "2026-10-05", weekday: 1, hours: 1, activity: "SQL joins" };
  const id = "3f2c8a1e-9c1b-4d6e-8f4a-1b2c3d4e5f60";
  assert.equal(BlockCreate.safeParse(base).success, true);
  assert.equal(BlockCreate.safeParse({ ...base, topic_id: id, resource_id: null }).success, true);
  assert.equal(BlockCreate.safeParse({ ...base, topic_id: "not-an-id" }).success, false);
  assert.equal(BlockCreate.safeParse({ ...base, course_id: id }).success, false, "no other fields");
  assert.equal(BlockCreate.omit({ week_start: true }).partial().strict().safeParse({ topic_id: null }).success, true);
});

test("a streak longer than the 11 weeks read every time is followed further back", async () => {
  // Study in each of the last 20 weeks (one session on the Monday), nothing before that.
  const blocks = Array.from({ length: 20 }, (_, i) => ({ id: `b${i}`, week_start: addDaysIso("2026-10-05", -7 * i), weekday: 0, hours: 1, topic_id: null, done: true }));
  blocks.push({ id: "old", week_start: addDaysIso("2026-10-05", -7 * 22), weekday: 0, hours: 1, topic_id: null, done: true }); // one week missing before it
  const o = await studyOverview(fakeDb({ courses: [], course_topics: [], course_units: [], study_blocks: blocks, learning_resources: [] }), TODAY);
  assert.equal(o.stats.streak, 20);
  assert.equal(o.stats.weeks.length, 8);
  assert.deepEqual(o.stats.weeks.map((w) => w.hours), [1, 1, 1, 1, 1, 1, 1, 1]);
  // A short streak does not need the older sessions.
  const short = await studyOverview(fakeDb({ courses: [], course_topics: [], course_units: [], study_blocks: blocks.slice(0, 3), learning_resources: [] }), TODAY);
  assert.equal(short.stats.streak, 3);
});

test("a database failure while checking a session's links is a server error, not 'not yours'", async () => {
  const db = fakeDb({ course_topics: [{ id: "T1" }] }, ["course_topics"]);
  await assert.rejects(checkBlockLinks(db, { topic_id: "T1" }), (e: unknown) => e instanceof HttpError && e.status === 500);
});

test("revision: finished topics and library items that are due to be looked at again", async () => {
  const db = fakeDb({
    courses: courseRows, course_units: unitRows, course_topics: [
      { ...topicRows[1], status: "done", completed_at: "2026-10-07T04:00:00+00:00", revision_step: 0 }, // finished yesterday: first look
      { ...row("x1", "A", "u1", "1.5"), status: "done", completed_at: "2026-10-01T04:00:00+00:00", revision_step: 1 }, // 7 days ago, first look done: second look
      { ...row("x2", "A", "u1", "1.6"), status: "done", completed_at: "2026-09-17T04:00:00+00:00", revision_step: 3 }, // all three done
      { ...row("x3", "A", "u1", "1.7"), status: "done", completed_at: "2026-10-08T01:00:00+00:00", revision_step: 0 }, // finished today
    ],
    study_blocks: [],
    learning_resources: [
      { id: "r9", title: "SEO basics", platform: "Coursera", provider: "", status: "completed", completed_on: "2026-10-01", revision_step: 1 },
      { id: "r8", title: "Old course", platform: "Udemy", provider: "", status: "completed", completed_on: "2026-07-01", revision_step: 0 },
    ],
  });
  const o = await studyOverview(db, TODAY, "UTC");
  assert.deepEqual(o.revision.map((r) => [r.kind, r.id, r.step, r.dueAfter, r.daysSince]), [["topic", "a2", 0, 1, 1], ["topic", "x1", 1, 7, 7], ["resource", "r9", 1, 7, 7]]);
  assert.equal(o.revision.find((r) => r.id === "a2")?.label, "Digital Marketing");
  assert.equal(o.revision.find((r) => r.id === "r9")?.href, "/learning/library");
  assert.equal(o.revision.find((r) => r.id === "x1")?.href, "/learning/A");
});
