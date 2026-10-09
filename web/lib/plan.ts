// Learning → planning the weeks: which week each unfinished topic goes in, from the hours it still needs and the hours
// you can study a week (rules, no AI). Plain functions: the server applies the answer, the tests check it.
import { courseWeeks, currentWeek, MAX_COURSE_WEEKS } from "./course.ts";
import { addDays, daysBetween, mondayOf } from "./dates.ts";
import type { Outline } from "./outline.ts";
import { byOrder, hoursLeft, type StudyTopic } from "./study.ts";

export type PlanCourse = { start_date: string; target_date: string; weekly_plan: number[] };
export type PlanTopic = Pick<StudyTopic, "id" | "code" | "status" | "est_hours" | "actual_hours" | "planned_week" | "unit_position" | "position">;
export type Assignment = { id: string; week: number };
export type Plan = {
  assignments: Assignment[];
  /** Planned hours of each week of the course, for saving as the course's weekly plan. */
  weekly_plan: number[];
  /** The week the planning started from (this week, or week 1 before the course starts). */
  firstWeek: number;
  /** Last week that got a topic. */
  lastWeek: number;
  /** Hours that did not fit before the target date (they were put in the last week). */
  overflow: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;
/** The plan table accepts at most 80 hours for a week (a very big topic in one week is shown as 80). */
const MAX_WEEK_HOURS = 80;

/** An outline as unplanned topics, in order (for planning it before the course exists). */
export const topicsFromOutline = (outline: Outline): PlanTopic[] =>
  outline.units.flatMap((unit, i) =>
    unit.topics.map((t, j) => ({ id: `${i}.${j}`, code: `${i + 1}.${j + 1}`, status: "not-started", est_hours: t.hours, actual_hours: 0, planned_week: null, unit_position: i, position: j })),
  );

/** Which week of the course today is in, for planning: 1 before it starts, the last week after it ends. */
export function planningWeek(course: Pick<PlanCourse, "start_date" | "target_date">, today: string) {
  return today < course.start_date ? 1 : currentWeek({ ...course, weekly_plan: [] }, today);
}

/**
 * Spreads the unfinished topics over the weeks from this week to the target date, in course order, filling each week up
 * to `weeklyHours` before starting the next (a topic bigger than a week gets a week of its own).
 * Finished topics, and topics whose hours are all logged, keep their week. Weeks before this one are left as they were.
 * What does not fit before the target date goes into the last week and is counted in `overflow`.
 */
export function autoPlan(course: PlanCourse, topics: PlanTopic[], weeklyHours: number, today: string): Plan {
  const weeks = Math.min(MAX_COURSE_WEEKS, courseWeeks(course));
  const first = Math.min(weeks, planningWeek(course, today));
  const cap = Math.min(MAX_WEEK_HOURS, Math.max(0.5, weeklyHours));
  const todo = topics.filter((t) => t.status !== "done" && hoursLeft(t) > 0).sort(byOrder as (a: PlanTopic, b: PlanTopic) => number);
  const moving = new Set(todo.map((t) => t.id));

  // Topics that stay where they are (finished, or all their hours logged) still belong to their weeks: they are part of the
  // week's planned hours, and what was already done this week leaves less of this week to fill.
  const fixed = new Array<number>(weeks).fill(0);
  for (const t of topics) if (!moving.has(t.id) && t.planned_week != null && t.planned_week >= first && t.planned_week <= weeks) fixed[t.planned_week - 1] += Number(t.est_hours);

  const load = new Array<number>(weeks).fill(0);
  load[first - 1] = fixed[first - 1];
  const assignments: Assignment[] = [];
  let week = first;
  for (const topic of todo) {
    const need = hoursLeft(topic);
    // The next week, unless this one is still empty (a topic bigger than a week gets one to itself) or it is the last.
    if (load[week - 1] > 0 && load[week - 1] + need > cap + 1e-9 && week < weeks) week += 1;
    load[week - 1] += need;
    assignments.push({ id: topic.id, week });
  }
  // What the last week holds beyond what a week can take did not fit before the target date.
  const overflow = Math.max(0, load[weeks - 1] - cap);

  const weekly_plan = Array.from({ length: weeks }, (_, i) =>
    i + 1 < first ? Math.min(MAX_WEEK_HOURS, Number(course.weekly_plan[i] ?? 0)) : Math.min(MAX_WEEK_HOURS, round2(load[i] + (i + 1 === first ? 0 : fixed[i]))),
  );
  return { assignments, weekly_plan, firstWeek: first, lastWeek: assignments.length ? Math.max(...assignments.map((a) => a.week)) : first, overflow: round2(overflow) };
}

/**
 * "Carry over": topics planned for an earlier week that are not finished move to this week, and this week's plan
 * grows by their hours. Nothing else changes.
 */
export function carryOver(course: PlanCourse, topics: PlanTopic[], today: string): Plan {
  const weeks = Math.min(MAX_COURSE_WEEKS, courseWeeks(course));
  const week = Math.min(weeks, planningWeek(course, today));
  const late = topics.filter((t) => t.status !== "done" && t.planned_week != null && t.planned_week < week && hoursLeft(t) > 0);
  const extra = late.reduce((sum, t) => sum + hoursLeft(t), 0);
  const weekly_plan = Array.from({ length: weeks }, (_, i) => Math.min(MAX_WEEK_HOURS, Number(course.weekly_plan[i] ?? 0) + (i + 1 === week ? round2(extra) : 0)));
  return { assignments: late.map((t) => ({ id: t.id, week })), weekly_plan, firstWeek: week, lastWeek: week, overflow: 0 };
}

/** How many weeks would be needed at this pace, and the pace that finishes on time ("5h a week", or 0 when nothing is left). */
export function neededPace(course: Pick<PlanCourse, "start_date" | "target_date">, topics: PlanTopic[], today: string) {
  const left = topics.filter((t) => t.status !== "done").reduce((sum, t) => sum + hoursLeft(t), 0);
  const weeksLeft = Math.max(1, courseWeeks({ ...course, weekly_plan: [] }) - planningWeek(course, today) + 1);
  return { left: round2(left), weeksLeft, perWeek: round2(left / weeksLeft), daysLeft: Math.max(0, daysBetween(today, course.target_date)) };
}

/**
 * The dates of a course made for one missing skill: it starts this week's Monday and ends on the nearest last date of the
 * jobs that ask for it (at least one full week, at most 3 years), or after `weeksNeeded` weeks when there is no such date.
 */
export function skillCourseDates(today: string, by: string | undefined, weeksNeeded: number) {
  const start = mondayOf(today);
  const days = by ? Math.max(6, daysBetween(start, by)) : weeksNeeded * 7 - 1;
  return { start, target: addDays(start, Math.min(156 * 7 - 1, days)) };
}
