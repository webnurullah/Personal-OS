import assert from "node:assert/strict";
import test from "node:test";
import { certificatesSince, courseProgress, linkedValues, type GoalLinkFacts, type GoalLinkOwn } from "../lib/goal-link.ts";

const topic = (status: string, est: number, actual = 0) => ({ status, est_hours: est, actual_hours: actual });
const goal = (over: Partial<GoalLinkOwn> = {}): GoalLinkOwn => ({ link_kind: "course", course_id: "c1", progress_mode: "value", created_at: "2026-10-01T05:00:00+00:00", ...over });
const facts = (over: Partial<GoalLinkFacts> = {}): GoalLinkFacts => ({ topics: new Map([["c1", [topic("done", 4), topic("in-progress", 3, 1.5), topic("not-started", 3, 0)]]]), certificates: [], ...over });

test("a course's progress is the hours done of all hours", () => {
  assert.deepEqual(courseProgress([topic("done", 4), topic("in-progress", 3, 1.5), topic("not-started", 3)]), { current: 5.5, target: 10 });
  assert.deepEqual(courseProgress([topic("in-progress", 2, 9)]), { current: 2, target: 2 }); // never more than the estimate
});

test("a course with no hours follows nothing", () => {
  assert.equal(courseProgress([]), null);
  assert.equal(courseProgress([topic("done", 0)]), null);
});

test("quarter hours are kept, floating-point dust is not", () => {
  assert.deepEqual(courseProgress([topic("in-progress", 1, 0.1), topic("in-progress", 1, 0.2)]), { current: 0.3, target: 2 });
});

test("certificates count from the day the goal was made", () => {
  assert.equal(certificatesSince(["2026-09-30", "2026-10-01", "2026-10-15", null], "2026-10-01"), 2);
  assert.equal(certificatesSince([], "2026-10-01"), 0);
});

test("a goal that follows a course takes its hours, target and unit", () => {
  assert.deepEqual(linkedValues(goal(), facts()), { current_value: 5.5, target_value: 10, unit: "hours" });
});

test("a goal that follows certificates takes the count and keeps its own target", () => {
  const v = linkedValues(goal({ link_kind: "certificates", course_id: null }), facts({ certificates: ["2026-09-01", "2026-10-03", "2026-10-09"] }));
  assert.deepEqual(v, { current_value: 2 });
});

test("a goal that follows nothing, or cannot, keeps the typed numbers", () => {
  assert.equal(linkedValues(goal({ link_kind: null, course_id: null }), facts()), null);
  assert.equal(linkedValues(goal({ course_id: "gone" }), facts()), null); // the course was deleted
  assert.equal(linkedValues(goal({ course_id: null }), facts()), null);
  assert.equal(linkedValues(goal(), facts({ topics: new Map([["c1", []]]) })), null); // no hours yet
  assert.equal(linkedValues(goal({ progress_mode: "milestones" }), facts()), null);
});

import { checkGoalLink, GoalCreate } from "../lib/server/schemas.ts";

test("a goal's link must make sense", () => {
  const ok = (v: unknown) => checkGoalLink(GoalCreate.partial().strict().parse(v));
  const id = "11111111-1111-4111-8111-111111111111";
  assert.deepEqual(ok({ link_kind: "course", course_id: id }), { link_kind: "course", course_id: id });
  assert.throws(() => ok({ link_kind: "course" }), /Pick the course/);
  assert.throws(() => ok({ link_kind: "course", course_id: null }), /Pick the course/);
  assert.throws(() => ok({ course_id: id }), /only be chosen/);
  assert.throws(() => ok({ link_kind: "certificates", course_id: id }), /only be chosen/);
  assert.throws(() => ok({ link_kind: "course", course_id: id, progress_mode: "milestones" }), /measured in a number/);
  assert.deepEqual(ok({ link_kind: "certificates" }), { link_kind: "certificates", course_id: null }); // clears an old course
  assert.deepEqual(ok({ link_kind: null }), { link_kind: null, course_id: null });
  assert.deepEqual(ok({ title: "No link" }), { title: "No link" }); // not mentioned: left alone
  assert.throws(() => GoalCreate.parse({ title: "x", link_kind: "bogus" }));
});
