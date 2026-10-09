import { linkedValues, type GoalLinkFacts } from "../goal-link.ts";
import { must } from "./http.ts";
import { fetchAll } from "./paging.ts";
import type { Db } from "./supabase.ts";

type MilestoneFacts = { at_value: number | null; done: boolean; position: number };
type GoalFacts = { current_value: number; target_value: number; progress_mode: string; goal_milestones?: MilestoneFacts[] };

/**
 * A goal's progress, worked out from its facts:
 * - "value" goals: current ÷ target
 * - "milestones" goals: ticked milestones ÷ all milestones
 * Milestones with an at_value tick themselves once the goal reaches that value.
 */
export function withProgress<M extends MilestoneFacts, G extends GoalFacts & { goal_milestones?: M[] }>(goal: G) {
  const { goal_milestones: raw = [], ...rest } = goal;
  const milestones = [...raw]
    .sort((a, b) => a.position - b.position)
    .map((m) => ({ ...m, done: m.at_value === null ? m.done : Number(goal.current_value) >= Number(m.at_value) }));

  let percent: number;
  if (goal.progress_mode === "milestones") {
    percent = milestones.length ? Math.round((milestones.filter((m) => m.done).length / milestones.length) * 100) : 0;
  } else {
    percent = Math.min(100, Math.round((Number(goal.current_value) / Number(goal.target_value)) * 100));
  }
  return { ...rest, milestones, percent };
}

type LinkRow = { link_kind: string | null; course_id: string | null; progress_mode: string; created_at: string; current_value: number; target_value: number; unit: string };

/**
 * Goals that follow a course or the certificates you earn get their numbers from there (the numbers typed by hand stay in
 * the row, and show again if the course is deleted). `linked` says whether the numbers shown come from the link, and
 * `course_title` names the course.
 */
export async function linkGoals<G extends LinkRow>(db: Db, goals: G[]) {
  const courseIds = [...new Set(goals.filter((g) => g.progress_mode === "value" && g.link_kind === "course" && g.course_id).map((g) => g.course_id as string))];
  const wantsCertificates = goals.some((g) => g.progress_mode === "value" && g.link_kind === "certificates");
  const facts: GoalLinkFacts = { topics: new Map(), certificates: [] };
  const titles = new Map<string, string>();
  await Promise.all([
    courseIds.length
      ? fetchAll(() => db.from("course_topics").select("id, course_id, status, est_hours, actual_hours").in("course_id", courseIds).order("id")).then((topics) => {
          for (const t of topics) facts.topics.set(t.course_id, [...(facts.topics.get(t.course_id) ?? []), t]);
        })
      : null,
    courseIds.length
      ? db.from("courses").select("id, title").in("id", courseIds).then(must).then((rows) => rows.forEach((c) => titles.set(c.id, c.title)))
      : null,
    wantsCertificates
      ? fetchAll(() => db.from("learning_resources").select("id, completed_on").eq("kind", "certificate").eq("status", "completed").order("id")).then((rows) => {
          facts.certificates = rows.map((r) => r.completed_on);
        })
      : null,
  ]);
  return goals.map((goal) => {
    const values = linkedValues(goal, facts);
    return {
      ...goal,
      ...(values ?? {}),
      linked: values !== null,
      course_title: goal.course_id ? (titles.get(goal.course_id) ?? null) : null,
    };
  });
}
