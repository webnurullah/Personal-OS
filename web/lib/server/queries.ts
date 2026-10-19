// Database reads shared by several endpoints.
import { doneHours } from "../course.ts";
import { sessionSeconds } from "../project-time.ts";
import { courseHealth } from "../study.ts";
import { addDays, daysBetween } from "./dates.ts";
import { habitGoals, type HabitGoal } from "./habit-time.ts";
import { must } from "./http.ts";
import { fetchAll } from "./paging.ts";
import type { Db } from "./supabase.ts";

/**
 * Active habits with their done days. Streaks look back up to 400 days.
 * With the time zone, habits that have a time goal also get it (goal, sources, minutes counted today), and a goal reached today ticks the day.
 */
export async function loadHabits(db: Db, today: string, zone?: string) {
  const [rows, logs] = await Promise.all([
    db.from("habits").select("*").is("archived_at", null).order("position").order("created_at").then(must),
    fetchAll(() => db.from("habit_logs").select("habit_id, log_date").gte("log_date", addDays(today, -400)).order("log_date")),
  ]);
  if (!zone) return { habits: rows, logs };
  const { goals, ticked } = await habitGoals(db, rows, today, zone);
  const habits = rows.map((h) => ({ ...h, ...(goals.get(h.id) as HabitGoal) }));
  return { habits, logs: [...logs, ...ticked.map((id) => ({ habit_id: id, log_date: today }))] };
}

// Hours are kept to 3 decimals: enough for quarter hours and minutes, and it hides floating-point dust (0.1 + 0.2).
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Every course with its units and topics (the plain facts the summaries and "Study next" are worked out from). */
export async function loadCourseFacts(db: Db) {
  // Past 1,000 topics Supabase would cut the list short, so topics and units are read page by page.
  const [courses, topics, units, times, certificates] = await Promise.all([
    db.from("courses").select("id, title, subtitle, start_date, target_date, color, category, status").order("created_at").then(must),
    fetchAll(() => db.from("course_topics").select("id, course_id, unit_id, code, title, est_hours, actual_hours, status, planned_week, position").order("id")),
    fetchAll(() => db.from("course_units").select("id, course_id, position").order("id")),
    // The time counted by the timer on each course page.
    fetchAll(() => db.from("course_time").select("course_id, started_at, ended_at").order("id")),
    // The certificate courses linked to each course (dropped ones do not count).
    fetchAll(() => db.from("learning_resources").select("course_id, status").eq("kind", "certificate").not("course_id", "is", null).neq("status", "dropped").order("id")),
  ]);
  return { courses, topics, units, times, certificates };
}
export type CourseFacts = Awaited<ReturnType<typeof loadCourseFacts>>;

/** Short progress summary for each course (the Learning page and the course list). */
export function summariseCourses({ courses, topics, units, times = [], certificates = [] }: Omit<CourseFacts, "times" | "certificates"> & { times?: CourseFacts["times"]; certificates?: CourseFacts["certificates"] }, today: string) {
  const now = Date.now();
  return courses.map((course) => {
    const mine = topics.filter((t) => t.course_id === course.id);
    const est = mine.reduce((sum, t) => sum + Number(t.est_hours), 0);
    const done = mine.reduce((sum, t) => sum + doneHours(t), 0);
    const health = courseHealth(course, mine, today);
    // What is left to finish: topics not done, and units that are not finished (a unit is finished when it has topics and all of them are done).
    const myUnits = units.filter((u) => u.course_id === course.id);
    const inUnit = new Map<string, { all: number; done: number }>();
    for (const t of mine) {
      const c = inUnit.get(t.unit_id) ?? { all: 0, done: 0 };
      c.all++;
      if (t.status === "done") c.done++;
      inUnit.set(t.unit_id, c);
    }
    const topicsDone = mine.filter((t) => t.status === "done").length;
    const unitsDone = myUnits.filter((u) => { const c = inUnit.get(u.id); return c !== undefined && c.all > 0 && c.done === c.all; }).length;
    return {
      ...course,
      est_hours: round3(est),
      done_hours: round3(done),
      spent_hours: round3(mine.reduce((sum, t) => sum + Number(t.actual_hours), 0)),
      // Seconds counted by the timer on the course page (a running timer is counted up to now).
      time_seconds: times.filter((r) => r.course_id === course.id).reduce((sum, r) => sum + sessionSeconds(r, now), 0),
      percent: est ? Math.round((done / est) * 100) : 0,
      topic_count: mine.length,
      // Counted from the units themselves, so a unit with no topics yet is still a unit.
      unit_count: myUnits.length,
      topics_done: topicsDone,
      topics_left: mine.length - topicsDone,
      units_done: unitsDone,
      units_left: myUnits.length - unitsDone,
      // Certificate courses linked to this course, and how many are not completed yet.
      certificate_count: certificates.filter((r) => r.course_id === course.id).length,
      certificates_left: certificates.filter((r) => r.course_id === course.id && r.status !== "completed").length,
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
