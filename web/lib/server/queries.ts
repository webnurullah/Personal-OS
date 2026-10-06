// Database reads shared by several endpoints.
import { doneHours } from "../course.ts";
import { addDays, daysBetween } from "./dates.ts";
import { dbError, must } from "./http.ts";
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

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Short progress summary for each course (the Learning page and the course list). */
export async function courseSummaries(db: Db, today: string) {
  const [courses, topics] = await Promise.all([
    db.from("courses").select("id, title, subtitle, start_date, target_date, color").order("created_at"),
    db.from("course_topics").select("course_id, unit_id, est_hours, actual_hours, status, planned_week"),
  ]);
  if (courses.error) throw dbError(courses.error);
  if (topics.error) throw dbError(topics.error);

  return courses.data.map((course) => {
    const mine = topics.data.filter((t) => t.course_id === course.id);
    const est = mine.reduce((sum, t) => sum + Number(t.est_hours), 0);
    const done = mine.reduce((sum, t) => sum + doneHours(t), 0);
    return {
      ...course,
      est_hours: round1(est),
      done_hours: round1(done),
      spent_hours: round1(mine.reduce((sum, t) => sum + Number(t.actual_hours), 0)),
      percent: est ? Math.round((done / est) * 100) : 0,
      topic_count: mine.length,
      unit_count: new Set(mine.map((t) => t.unit_id)).size,
      days_left: daysBetween(today, course.target_date),
    };
  });
}
