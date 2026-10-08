// Database reads shared by several endpoints.
import { doneHours } from "../course.ts";
import { courseHealth } from "../study.ts";
import { addDays, daysBetween } from "./dates.ts";
import { must } from "./http.ts";
import { fetchAll } from "./paging.ts";
import type { Db } from "./supabase.ts";

/** Active habits with their done days. Streaks look back up to 400 days. */
export async function loadHabits(db: Db, today: string) {
  const [habits, logs] = await Promise.all([
    db.from("habits").select("*").is("archived_at", null).order("position").order("created_at").then(must),
    fetchAll(() => db.from("habit_logs").select("habit_id, log_date").gte("log_date", addDays(today, -400)).order("log_date")),
  ]);
  return { habits, logs };
}

// Hours are kept to 3 decimals: enough for quarter hours and minutes, and it hides floating-point dust (0.1 + 0.2).
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Every course with its units and topics (the plain facts the summaries and "Study next" are worked out from). */
export async function loadCourseFacts(db: Db) {
  // Past 1,000 topics Supabase would cut the list short, so topics and units are read page by page.
  const [courses, topics, units] = await Promise.all([
    db.from("courses").select("id, title, subtitle, start_date, target_date, color").order("created_at").then(must),
    fetchAll(() => db.from("course_topics").select("id, course_id, unit_id, code, title, est_hours, actual_hours, status, planned_week, position").order("id")),
    fetchAll(() => db.from("course_units").select("id, course_id, position").order("id")),
  ]);
  return { courses, topics, units };
}
export type CourseFacts = Awaited<ReturnType<typeof loadCourseFacts>>;

/** Short progress summary for each course (the Learning page and the course list). */
export function summariseCourses({ courses, topics, units }: CourseFacts, today: string) {
  return courses.map((course) => {
    const mine = topics.filter((t) => t.course_id === course.id);
    const est = mine.reduce((sum, t) => sum + Number(t.est_hours), 0);
    const done = mine.reduce((sum, t) => sum + doneHours(t), 0);
    const health = courseHealth(course, mine, today);
    return {
      ...course,
      est_hours: round3(est),
      done_hours: round3(done),
      spent_hours: round3(mine.reduce((sum, t) => sum + Number(t.actual_hours), 0)),
      percent: est ? Math.round((done / est) * 100) : 0,
      topic_count: mine.length,
      // Counted from the units themselves, so a unit with no topics yet is still a unit.
      unit_count: units.filter((u) => u.course_id === course.id).length,
      days_left: daysBetween(today, course.target_date),
      state: health.state,
      behind_hours: health.behindHours,
      weeks_behind: health.weeksBehind,
    };
  });
}

export async function courseSummaries(db: Db, today: string) {
  return summariseCourses(await loadCourseFacts(db), today);
}
