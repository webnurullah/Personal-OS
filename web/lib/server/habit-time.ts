// Habits fed by timers, server side: which projects and courses count for each habit, today's minutes, and ticking the day when the goal is reached.
import { addDays } from "./dates.ts";
import { goalReached, minutesToday, type SourceRow } from "../habit-time.ts";
import { fetchAll } from "./paging.ts";
import { must } from "./http.ts";
import type { Db } from "./supabase.ts";

export type HabitSource = { kind: "project" | "course"; id: string; name: string };
export type HabitGoal = { target_minutes: number | null; today_minutes: number; sources: HabitSource[] };

type HabitRow = { id: string; user_id: string; target_minutes: number | null; auto_checked_on: string | null };

/**
 * For each habit: its goal, its sources and the minutes counted today. When a goal is reached today the day is ticked (once a day: a day you
 * untick by hand stays unticked). Returns the habits' goal facts by id and the habit ids that were ticked now.
 */
export async function habitGoals(db: Db, habits: HabitRow[], today: string, zone: string, now = Date.now()) {
  const goals = new Map<string, HabitGoal>();
  const ticked: string[] = [];
  const ids = new Set(habits.map((h) => h.id));
  const [sourceRows, projects, courses] = await Promise.all([
    fetchAll(() => db.from("habit_sources").select("habit_id, project_id, course_id").order("id")),
    fetchAll(() => db.from("projects").select("id, name").order("id")),
    fetchAll(() => db.from("courses").select("id, title").order("id")),
  ]);
  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  const courseName = new Map(courses.map((c) => [c.id, c.title]));
  const sourcesOf = new Map<string, HabitSource[]>();
  for (const s of sourceRows) {
    if (!ids.has(s.habit_id)) continue;
    const list = sourcesOf.get(s.habit_id) ?? [];
    if (s.project_id && projectName.has(s.project_id)) list.push({ kind: "project", id: s.project_id, name: projectName.get(s.project_id) as string });
    else if (s.course_id && courseName.has(s.course_id)) list.push({ kind: "course", id: s.course_id, name: courseName.get(s.course_id) as string });
    sourcesOf.set(s.habit_id, list);
  }

  // Timer rows only when some habit has a goal and sources (sessions of the last days are enough to tell what started today).
  const timed = habits.filter((h) => h.target_minutes != null && (sourcesOf.get(h.id)?.length ?? 0) > 0);
  let rows: SourceRow[] = [];
  if (timed.length) {
    const since = new Date(now - 3 * 86400000).toISOString();
    const [pt, ct] = await Promise.all([
      fetchAll(() => db.from("project_time").select("project_id, started_at, ended_at").gte("started_at", since).order("id")),
      fetchAll(() => db.from("course_time").select("course_id, started_at, ended_at").gte("started_at", since).order("id")),
    ]);
    rows = [
      ...pt.map((r) => ({ key: `project:${r.project_id}`, started_at: r.started_at, ended_at: r.ended_at })),
      ...ct.filter((r) => r.course_id).map((r) => ({ key: `course:${r.course_id}`, started_at: r.started_at, ended_at: r.ended_at })),
    ];
  }

  for (const habit of habits) {
    const sources = sourcesOf.get(habit.id) ?? [];
    const minutes = habit.target_minutes != null && sources.length ? minutesToday(rows, new Set(sources.map((s) => `${s.kind}:${s.id}`)), today, zone, now) : 0;
    goals.set(habit.id, { target_minutes: habit.target_minutes, today_minutes: minutes, sources });
    if (goalReached(habit.target_minutes, minutes) && habit.auto_checked_on !== today) {
      must(await db.from("habit_logs").upsert({ habit_id: habit.id, log_date: today, user_id: habit.user_id }, { onConflict: "habit_id,log_date", ignoreDuplicates: true }));
      must(await db.from("habits").update({ auto_checked_on: today }).eq("id", habit.id).select("id"));
      ticked.push(habit.id);
    }
  }
  return { goals, ticked, since: addDays(today, 0) };
}

/** Replaces the projects and courses that count for a habit. */
export async function saveHabitSources(db: Db, habitId: string, sources: { kind: "project" | "course"; id: string }[]) {
  must(await db.from("habit_sources").delete().eq("habit_id", habitId));
  const seen = new Set<string>();
  const rows = sources
    .filter((s) => !seen.has(`${s.kind}:${s.id}`) && seen.add(`${s.kind}:${s.id}`))
    .map((s) => ({ habit_id: habitId, project_id: s.kind === "project" ? s.id : null, course_id: s.kind === "course" ? s.id : null }));
  if (rows.length) must(await db.from("habit_sources").insert(rows).select("id"));
}

/** Ticks today for every habit whose time goal is reached (called after a timer starts or pauses, and while one runs). */
export async function autoCheckHabits(db: Db, today: string, zone: string, now = Date.now()) {
  const habits = must(await db.from("habits").select("id, user_id, target_minutes, auto_checked_on").is("archived_at", null).not("target_minutes", "is", null));
  if (!habits.length) return [];
  return (await habitGoals(db, habits, today, zone, now)).ticked;
}
