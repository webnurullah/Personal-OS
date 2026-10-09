// Learning → "Add this week's topics to my tasks": one task per topic still to study in a week of the course.
import { hoursLeft } from "../study.ts";
import { addDays } from "./dates.ts";
import { must } from "./http.ts";
import { planningWeek } from "../plan.ts";
import type { Db } from "./supabase.ts";

/**
 * Makes a task "Study: 2.1 SQL joins" for each unfinished topic planned for the week (this week of the course unless one is
 * given), due on the last day of that week (today when that day has passed). A topic that already has an open task with
 * the same name is skipped, so pressing the button twice adds nothing twice.
 */
export async function tasksForWeek(db: Db, courseId: string, today: string, week?: number) {
  const course = must(await db.from("courses").select("id, title, start_date, target_date").eq("id", courseId).single());
  const which = week ?? planningWeek(course, today);
  const topics = must(await db.from("course_topics").select("id, code, title, status, est_hours, actual_hours").eq("course_id", courseId).eq("planned_week", which).order("position").order("code"))
    .filter((t) => t.status !== "done" && hoursLeft({ status: t.status, est_hours: Number(t.est_hours), actual_hours: Number(t.actual_hours) }) > 0);
  const weekEnd = addDays(course.start_date, which * 7 - 1);
  const due = weekEnd < today ? today : weekEnd;
  const titles = topics.map((t) => `Study: ${t.code} ${t.title}`.trim().slice(0, 200));
  if (!titles.length) return { created: 0, skipped: 0, week: which, due_date: due };

  const have = new Set(must(await db.from("tasks").select("title").is("done_at", null).in("title", titles)).map((t) => t.title));
  const fresh = titles.filter((title) => !have.has(title));
  if (fresh.length) must(await db.from("tasks").insert(fresh.map((title) => ({ title, due_date: due, notes: `From the course: ${course.title}`.slice(0, 2000) }))).select("id"));
  return { created: fresh.length, skipped: titles.length - fresh.length, week: which, due_date: due };
}
