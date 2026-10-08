// Database reads shared by several endpoints.
import { doneHours } from "../course.ts";
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

/** Short progress summary for each course (the Learning page and the course list). */
export async function courseSummaries(db: Db, today: string) {
  // Past 1,000 topics Supabase would cut the list short, so topics and units are read page by page.
  const [courses, topics, units] = await Promise.all([
    db.from("courses").select("id, title, subtitle, start_date, target_date, color").order("created_at").then(must),
    fetchAll(() => db.from("course_topics").select("course_id, est_hours, actual_hours, status, planned_week").order("id")),
    fetchAll(() => db.from("course_units").select("course_id").order("id")),
  ]);

  return courses.map((course) => {
    const mine = topics.filter((t) => t.course_id === course.id);
    const est = mine.reduce((sum, t) => sum + Number(t.est_hours), 0);
    const done = mine.reduce((sum, t) => sum + doneHours(t), 0);
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
    };
  });
}
