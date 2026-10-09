// A goal can follow something else instead of a number typed by hand:
//  * a course: hours done ÷ hours of the course (the same "done" the course page shows)
//  * the certificates you earn: how many were completed since the goal was made
// Plain functions, shared by the server (which fills the numbers in) and the tests.
import { doneHours } from "./course.ts";

export const GOAL_LINK_KINDS = ["course", "certificates"] as const;
export type GoalLinkKind = (typeof GOAL_LINK_KINDS)[number];

type Topic = { status: string; est_hours: number | string; actual_hours: number | string };
export type GoalLinkFacts = {
  /** The topics of each course the goals follow. */
  topics: Map<string, Topic[]>;
  /** The completion date of every completed certificate course ("YYYY-MM-DD", or null when it has none). */
  certificates: (string | null)[];
};
export type GoalLinkOwn = { link_kind: string | null; course_id: string | null; progress_mode: string; created_at: string };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Hours done and hours in all of a course; null when the course has no hours yet (nothing to follow). */
export function courseProgress(topics: Topic[]) {
  const target = topics.reduce((sum, t) => sum + Number(t.est_hours), 0);
  if (!(target > 0)) return null;
  const current = topics.reduce((sum, t) => sum + doneHours({ status: t.status, est_hours: Number(t.est_hours), actual_hours: Number(t.actual_hours), planned_week: null }), 0);
  return { current: round2(current), target: round2(target) };
}

/** How many certificates were completed on or after `since` (a certificate with no date is not counted). */
export const certificatesSince = (dates: (string | null)[], since: string) => dates.filter((d) => d !== null && d >= since).length;

/**
 * The numbers a linked goal shows instead of the ones typed by hand, or null when it follows nothing (not linked, a goal
 * measured in milestones, a course that was deleted or has no hours). Then the typed numbers stay in use.
 */
export function linkedValues(goal: GoalLinkOwn, facts: GoalLinkFacts): { current_value: number; target_value?: number; unit?: string } | null {
  if (goal.progress_mode !== "value") return null;
  if (goal.link_kind === "course") {
    const progress = goal.course_id ? courseProgress(facts.topics.get(goal.course_id) ?? []) : null;
    return progress ? { current_value: progress.current, target_value: progress.target, unit: "hours" } : null;
  }
  if (goal.link_kind === "certificates") return { current_value: certificatesSince(facts.certificates, goal.created_at.slice(0, 10)) };
  return null;
}
