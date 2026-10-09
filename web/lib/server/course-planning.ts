// Learning → faster setup, on the server: adding a pasted outline to a course and planning its weeks.
import { courseWeeks } from "../course.ts";
import { HttpError, must } from "./http.ts";
import { fetchAll } from "./paging.ts";
import { skillOutline, templateForSkill, templateWeeks } from "../course-templates.ts";
import { DEFAULT_TOPIC_HOURS, numberOutline, parseOutline } from "../outline.ts";
import { autoPlan, carryOver, skillCourseDates, type Plan, type PlanCourse, type PlanTopic } from "../plan.ts";
import type { Json } from "./database.types.ts";
import type { Db } from "./supabase.ts";

/** A course (dates and weekly plan) with its topics in planning form. */
export async function loadPlanning(db: Db, courseId: string): Promise<{ course: PlanCourse & { id: string; title: string }; topics: PlanTopic[]; units: { code: string; position: number }[] }> {
  const course = must(await db.from("courses").select("id, title, start_date, target_date, weekly_plan").eq("id", courseId).single());
  const [units, topics] = await Promise.all([
    fetchAll(() => db.from("course_units").select("id, code, position").eq("course_id", courseId).order("id")),
    fetchAll(() => db.from("course_topics").select("id, unit_id, code, status, est_hours, actual_hours, planned_week, position").eq("course_id", courseId).order("id")),
  ]);
  const unitPosition = new Map(units.map((u) => [u.id, u.position]));
  return {
    course: { id: course.id, title: course.title, start_date: course.start_date, target_date: course.target_date, weekly_plan: (course.weekly_plan ?? []).map(Number) },
    topics: topics.map((t) => ({ id: t.id, code: t.code, status: t.status, est_hours: Number(t.est_hours), actual_hours: Number(t.actual_hours), planned_week: t.planned_week, unit_position: unitPosition.get(t.unit_id) ?? 0, position: t.position })),
    units: units.map((u) => ({ code: u.code, position: u.position })),
  };
}

/** Adds the units and topics of a pasted outline after what the course already has (all or nothing). */
export async function addOutline(db: Db, courseId: string, text: string, defaultHours = DEFAULT_TOPIC_HOURS) {
  const outline = parseOutline(text, defaultHours);
  if (!outline.units.length) throw new HttpError(400, "I could not find any units or topics in that text. Put each unit on its own line and each topic on a line that starts with “-”.");
  const { units } = await loadPlanning(db, courseId);
  const numbered = numberOutline(outline, { codes: units.map((u) => u.code), positions: units.map((u) => u.position) });
  const made = must(await db.rpc("add_course_outline", { p_course: courseId, p_units: numbered as unknown as Json })) as { units: number; topics: number };
  return { units: made.units, topics: made.topics, hours: outline.hours, warnings: outline.warnings };
}

export type PlanResult = { changed: number; firstWeek: number; lastWeek: number; overflow: number; weeks: number };

/** Plans the weeks of a course ("plan": the rest of the course over your weekly hours; "carry": late topics move to this week) and saves them. */
export async function planCourse(db: Db, courseId: string, mode: "plan" | "carry", weeklyHours: number, today: string): Promise<PlanResult> {
  const { course, topics } = await loadPlanning(db, courseId);
  const plan: Plan = mode === "carry" ? carryOver(course, topics, today) : autoPlan(course, topics, weeklyHours, today);
  const changed = must(await db.rpc("plan_course", { p_course: courseId, p_weeks: plan.assignments as unknown as Json, p_weekly_plan: plan.weekly_plan }));
  return { changed, firstWeek: plan.firstWeek, lastWeek: plan.lastWeek, overflow: plan.overflow, weeks: courseWeeks(course) };
}

/** A course for learning one skill: from the matching template or the basics/project/interview plan, due by the given date, planned over your weekly hours. */
export async function courseForSkill(db: Db, input: { skill: string; by?: string; jobs?: string[] }, weeklyHours: number, today: string) {
  const skill = input.skill.trim();
  const template = templateForSkill(skill);
  const title = template ? template.title : `Learn ${skill}`;
  // Pressing the button twice (or from two jobs) does not make the same course twice.
  const same = must(await db.from("courses").select("id").eq("title", title).limit(1));
  if (same.length) return { id: same[0].id, existing: true, plan: null };

  const text = template?.outline ?? skillOutline(skill);
  // Due by the nearest last date of the jobs that ask for it, or when the plan ends at your weekly hours.
  const { start, target } = skillCourseDates(today, input.by, templateWeeks({ outline: text, weeklyHours }, weeklyHours));
  const subtitle = input.jobs?.length ? `Needed for: ${input.jobs.join(", ")}`.slice(0, 120) : template ? template.subtitle : "Learn a skill for a job";
  const course = must(await db.from("courses").insert({ title, subtitle, start_date: start, target_date: target, weekly_plan: [] }).select().single());
  try {
    await addOutline(db, course.id, text);
    const plan = await planCourse(db, course.id, "plan", weeklyHours, today);
    return { id: course.id, existing: false, plan };
  } catch (error) {
    // A course with nothing in it is no use: remove the one just made (it was never shown to anyone).
    await db.from("courses").delete().eq("id", course.id);
    throw error;
  }
}
