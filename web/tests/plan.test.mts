// Learning → faster setup: the course templates and the week planner. Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { addDays } from "../lib/dates.ts";
import { COURSE_TEMPLATES, skillOutline, templateFor, templateForSkill, templateSummary, templateWeeks } from "../lib/course-templates.ts";
import { parseOutline } from "../lib/outline.ts";
import { autoPlan, carryOver, neededPace, planningWeek, skillCourseDates, topicsFromOutline, type PlanCourse, type PlanTopic } from "../lib/plan.ts";
import { STARTER_IDEAS } from "../lib/starter-ideas.ts";

const course: PlanCourse = { start_date: "2026-09-14", target_date: "2026-12-06", weekly_plan: [4, 4, 4] }; // 12 weeks
const TODAY = "2026-10-08"; // week 4

let n = 0;
const topic = (o: Partial<PlanTopic> = {}): PlanTopic => ({ id: `t${++n}`, code: `1.${n}`, status: "not-started", est_hours: 2, actual_hours: 0, planned_week: null, unit_position: 0, position: n, ...o });

test("every template reads cleanly, fits its weeks, and belongs to a library subject", () => {
  const keys = new Set<string>();
  for (const t of COURSE_TEMPLATES) {
    assert.ok(!keys.has(t.key), `${t.key} twice`);
    keys.add(t.key);
    assert.ok(STARTER_IDEAS.some((s) => s.subject === t.subject), `${t.key}: subject "${t.subject}" is not a library subject`);
    const outline = parseOutline(t.outline);
    assert.deepEqual(outline.warnings, [], t.key);
    assert.ok(outline.units.length >= 3 && outline.topicCount >= 10, `${t.key}: ${outline.units.length} units, ${outline.topicCount} topics`);
    assert.ok(outline.units.every((u) => u.topics.length >= 2), `${t.key}: a unit has fewer than 2 topics`);
    assert.ok(outline.units.flatMap((u) => u.topics).every((x) => x.hours >= 0.25 && x.title.length > 3), `${t.key}: odd topic`);
    assert.ok(t.title.length <= 300 && t.subtitle.length <= 120, t.key);
    // Planned at its own pace, everything fits in the weeks the template says, with one spare week at the end.
    const weeks = templateWeeks(t);
    const start = "2026-10-05";
    const planned = autoPlan({ start_date: start, target_date: addDays(start, weeks * 7 - 1), weekly_plan: [] }, topicsFromOutline(outline), t.weeklyHours, start);
    assert.equal(planned.overflow, 0, `${t.key}: ${planned.overflow}h do not fit in ${weeks} weeks at ${t.weeklyHours}h`);
    assert.equal(planned.lastWeek, weeks - 1, t.key);
    assert.ok(weeks >= 5 && weeks <= 20, `${t.key}: ${weeks} weeks`);
    const summary = templateSummary(t);
    assert.ok(summary.hours >= 20 && summary.hours <= weeks * t.weeklyHours, `${t.key}: ${summary.hours}h`);
  }
});

test("finding the template for a course name and for a skill", () => {
  assert.equal(templateFor("Digital Marketing 2026")?.key, "digital-marketing");
  assert.equal(templateFor("Excel basics")?.key, "excel");
  assert.equal(templateFor("SQL for beginners")?.key, "sql");
  assert.equal(templateFor("Learn WordPress")?.key, "web-wordpress");
  assert.equal(templateFor("Freelancing from zero")?.key, "freelancing");
  assert.equal(templateFor("Spoken English")?.key, "english");
  assert.equal(templateFor("Level 4 Award in IQA"), null);
  assert.equal(templateFor("  "), null);
  assert.equal(templateForSkill("SQL")?.key, "sql");
  assert.equal(templateForSkill("  Excel ")?.key, "excel");
  assert.equal(templateForSkill("Canva")?.key, "graphic-design");
  assert.equal(templateForSkill("SEO"), null, "broad subjects are too big for one missing skill");
  assert.equal(templateForSkill("React"), null);
});

test("the plan for a skill that has no template: basics, a project and interview questions", () => {
  const out = parseOutline(skillOutline("React"));
  assert.deepEqual(out.units.map((u) => u.title), ["Basics of React", "Practice project", "Interview questions"]);
  assert.equal(out.topicCount, 9);
  assert.equal(out.hours, 20);
  assert.ok(parseOutline(skillOutline("x".repeat(500))).units.every((u) => u.title.length <= 200));
  assert.equal(parseOutline(skillOutline("  ")).topicCount, 9);
});

test("planning spreads the unfinished topics from this week, in course order, up to the weekly hours", () => {
  const done = topic({ id: "a", status: "done", planned_week: 1, position: 1 });
  const started = topic({ id: "b", status: "in-progress", est_hours: 3, actual_hours: 1, position: 2 }); // 2h left
  const rest = [topic({ id: "c", position: 3 }), topic({ id: "d", position: 4 }), topic({ id: "e", est_hours: 4, position: 5 }), topic({ id: "f", est_hours: 1, position: 6 })];
  const plan = autoPlan(course, [done, ...rest.slice().reverse(), started], 5, TODAY);
  assert.deepEqual(plan.assignments, [{ id: "b", week: 4 }, { id: "c", week: 4 }, { id: "d", week: 5 }, { id: "e", week: 6 }, { id: "f", week: 6 }]);
  assert.deepEqual(plan.weekly_plan, [4, 4, 4, 4, 2, 5, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual([plan.firstWeek, plan.lastWeek, plan.overflow], [4, 6, 0]);
  assert.equal(plan.assignments.some((a) => a.id === "a"), false, "a finished topic keeps its week");
});

test("planning before the course starts begins in week 1; after it ends, in the last week", () => {
  const topics = [topic({ id: "a" }), topic({ id: "b" })];
  assert.equal(planningWeek(course, "2026-09-01"), 1);
  assert.equal(planningWeek(course, "2026-09-14"), 1);
  assert.equal(planningWeek(course, "2026-12-20"), 12);
  assert.deepEqual(autoPlan(course, topics, 3, "2026-09-01").assignments, [{ id: "a", week: 1 }, { id: "b", week: 2 }]);
  const late = autoPlan(course, topics, 3, "2026-12-20");
  assert.deepEqual(late.assignments, [{ id: "a", week: 12 }, { id: "b", week: 12 }]);
  assert.equal(late.overflow, 1, "4h in the last week at 3h a week: 1h does not fit");
  assert.deepEqual(late.weekly_plan.slice(0, 3), [4, 4, 4], "weeks before are left as they were");
  assert.equal(late.weekly_plan[11], 4);
});

test("a topic bigger than a week gets a week to itself; hours that do not fit are counted", () => {
  const big = autoPlan(course, [topic({ id: "a", est_hours: 8 }), topic({ id: "b", est_hours: 1 })], 5, TODAY);
  assert.deepEqual(big.assignments, [{ id: "a", week: 4 }, { id: "b", week: 5 }]);
  assert.equal(big.overflow, 0);
  const short: PlanCourse = { start_date: "2026-10-05", target_date: "2026-10-18", weekly_plan: [] }; // 2 weeks
  const tight = autoPlan(short, Array.from({ length: 10 }, (_, i) => topic({ id: `t${i}` })), 5, "2026-10-05");
  assert.equal(tight.lastWeek, 2);
  assert.equal(tight.overflow, 11, "week 1 takes 4h, the other 16h go in week 2, which holds 5h: 11h do not fit");
});

test("planning limits: weekly hours between half an hour and 80, and the plan table never gets more than 80 for a week", () => {
  const one = [topic({ id: "a", est_hours: 2 }), topic({ id: "b", est_hours: 2 })];
  assert.deepEqual(autoPlan(course, one, 0, TODAY).assignments.map((a) => a.week), [4, 5], "0 hours a week is taken as half an hour: a topic per week");
  assert.deepEqual(autoPlan(course, one, 1000, TODAY).assignments.map((a) => a.week), [4, 4]);
  const huge = autoPlan(course, [topic({ id: "a", est_hours: 300 })], 5, TODAY);
  assert.equal(huge.weekly_plan[3], 80);
});

test("topics whose hours are all logged and finished topics are not moved; nothing to plan changes nothing", () => {
  const full = topic({ id: "full", status: "in-progress", est_hours: 2, actual_hours: 2, planned_week: 1 });
  const finished = topic({ id: "fin", status: "done", planned_week: 2 });
  const plan = autoPlan(course, [full, finished], 5, TODAY);
  assert.deepEqual(plan.assignments, []);
  assert.deepEqual(plan.weekly_plan, [4, 4, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(plan.lastWeek, plan.firstWeek);
});

test("carry over: unfinished topics planned for earlier weeks move to this week and this week's plan grows", () => {
  const late1 = topic({ id: "a", planned_week: 2 });
  const late2 = topic({ id: "b", status: "in-progress", est_hours: 3, actual_hours: 1, planned_week: 3 }); // 2h left
  const now = topic({ id: "c", planned_week: 4 });
  const later = topic({ id: "d", planned_week: 6 });
  const done = topic({ id: "e", status: "done", planned_week: 1 });
  const full = topic({ id: "f", status: "in-progress", est_hours: 2, actual_hours: 2, planned_week: 1 });
  const plan = carryOver({ ...course, weekly_plan: [4, 4, 4, 5, 5, 5] }, [late1, late2, now, later, done, full], TODAY);
  assert.deepEqual(plan.assignments, [{ id: "a", week: 4 }, { id: "b", week: 4 }]);
  assert.deepEqual(plan.weekly_plan, [4, 4, 4, 9, 5, 5, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(carryOver(course, [now, later, done], TODAY).assignments, []);
  assert.deepEqual(carryOver(course, [now], TODAY).weekly_plan, [4, 4, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
});

test("the pace that finishes on time", () => {
  const topics = [topic({ id: "a", est_hours: 10 }), topic({ id: "b", status: "in-progress", est_hours: 6, actual_hours: 2 }), topic({ id: "c", status: "done", est_hours: 9 })];
  // Today is in week 4 of 12: 9 weeks left (4 … 12), 14h to do.
  assert.deepEqual(neededPace(course, topics, TODAY), { left: 14, weeksLeft: 9, perWeek: 1.56, daysLeft: 59 });
  assert.equal(neededPace(course, topics, "2026-12-20").weeksLeft, 1);
});

test("a course for a missing skill starts this Monday and ends on the nearest last date, within one week to three years", () => {
  assert.deepEqual(skillCourseDates("2026-10-08", "2026-11-20", 5), { start: "2026-10-05", target: "2026-11-20" });
  assert.deepEqual(skillCourseDates("2026-10-08", "2026-10-09", 5), { start: "2026-10-05", target: "2026-10-11" }, "a date in a day or two: still a whole first week");
  assert.deepEqual(skillCourseDates("2026-10-08", "2026-09-01", 5), { start: "2026-10-05", target: "2026-10-11" }, "a date that has passed");
  assert.equal(skillCourseDates("2026-10-08", "2040-01-01", 5).target, addDays("2026-10-05", 156 * 7 - 1));
  assert.deepEqual(skillCourseDates("2026-10-08", undefined, 4), { start: "2026-10-05", target: "2026-11-01" });
  assert.deepEqual(skillCourseDates("2026-10-05", undefined, 1), { start: "2026-10-05", target: "2026-10-11" });
});

test("topics that stay in their weeks (finished) count in the plan, and what is done this week leaves less of it to fill", () => {
  const short: PlanCourse = { start_date: "2026-01-05", target_date: "2026-02-01", weekly_plan: [3, 0, 3, 0] }; // 4 weeks
  const topics = [
    topic({ id: "d1", status: "done", est_hours: 3, planned_week: 1 }),
    topic({ id: "d3", status: "done", est_hours: 3, planned_week: 3 }),
    topic({ id: "a", position: 1 }), topic({ id: "b", position: 2 }), topic({ id: "c", position: 3 }),
  ];
  const plan = autoPlan(short, topics, 5, "2026-01-05");
  assert.deepEqual(plan.assignments, [{ id: "a", week: 1 }, { id: "b", week: 2 }, { id: "c", week: 2 }], "3h are done in week 1 already: only one more topic fits");
  assert.deepEqual(plan.weekly_plan, [5, 4, 3, 0], "week 3 keeps its finished topic's 3h");
});

test("a course that ends exactly 156 weeks after it starts is planned in 156 weeks", () => {
  const start = "2026-10-05";
  const last: PlanCourse = { start_date: start, target_date: addDays(start, 156 * 7 - 1), weekly_plan: [] };
  const plan = autoPlan(last, [topic({ id: "a" })], 5, start);
  assert.equal(plan.weekly_plan.length, 156);
  // An older course saved with one day more (157 weeks) is still planned within 156.
  const odd = autoPlan({ ...last, target_date: addDays(start, 156 * 7) }, [topic({ id: "a" })], 5, start);
  assert.equal(odd.weekly_plan.length, 156);
  assert.ok(odd.assignments.every((a) => a.week <= 156));
  assert.ok(carryOver({ ...last, target_date: addDays(start, 156 * 7) }, [topic({ id: "a", planned_week: 1 })], addDays(start, 156 * 7)).weekly_plan.length === 156);
});

test("finished topics in later weeks leave less room there, and the overflow counts only what was placed", () => {
  const four: PlanCourse = { start_date: "2026-01-05", target_date: "2026-02-01", weekly_plan: [0, 0, 0, 0] };
  const six = Array.from({ length: 6 }, (_, i) => topic({ id: `n${i}`, position: i + 1 }));
  const plan = autoPlan(four, [topic({ id: "d3", status: "done", est_hours: 4, planned_week: 3 }), ...six], 5, "2026-01-05");
  assert.deepEqual(plan.weekly_plan, [4, 4, 4, 4], "week 3 already holds 4h of finished work: 2 more would pass 5h, so they go to week 4");
  assert.equal(plan.overflow, 0);
  assert.deepEqual(plan.assignments.map((a) => a.week), [1, 1, 2, 2, 4, 4]);

  const last = autoPlan(four, [topic({ id: "d4", status: "done", est_hours: 4, planned_week: 4 }), ...Array.from({ length: 12 }, (_, i) => topic({ id: `m${i}`, position: i + 1 }))], 5, "2026-01-05");
  // 24h to place: weeks 1-3 take 4h each, the rest goes into the last week, which already holds 4h.
  assert.equal(last.weekly_plan.reduce((a, b) => a + b, 0), 28);
  assert.equal(last.overflow, last.weekly_plan[3] - 5, "everything beyond a normal week in the last week did not fit");
});
