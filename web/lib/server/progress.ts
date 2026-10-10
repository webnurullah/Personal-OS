// Learning → progress by week, month and quarter, read from the finished study sessions, finished topics and completed
// library items. The sums are in lib/progress.ts.
import { addDays } from "../dates.ts";
import { buildProgress, progressFrom, type LearningProgress, type ProgressSession } from "../progress.ts";
import { dateIn, startOfDayUtc } from "./dates.ts";
import { must } from "./http.ts";
import { fetchAll } from "./paging.ts";
import type { Db } from "./supabase.ts";

export async function learningProgress(db: Db, today: string, zone: string, weeklyGoal: number): Promise<LearningProgress> {
  const from = progressFrom(today);
  const [blocks, topics, courses, doneTopics, doneItems, weeks] = await Promise.all([
    // A session is on week_start + weekday, so the week before `from` can hold sessions of its first days.
    fetchAll(() => db.from("study_blocks").select("week_start, weekday, hours, topic_id, resource_id").eq("done", true).gte("week_start", addDays(from, -6)).order("id")),
    fetchAll(() => db.from("course_topics").select("id, course_id").order("id")),
    db.from("courses").select("id, title").then(must),
    fetchAll(() => db.from("course_topics").select("id, completed_at").eq("status", "done").gte("completed_at", startOfDayUtc(from, zone)).order("id")),
    fetchAll(() => db.from("learning_resources").select("id, completed_on").eq("status", "completed").gte("completed_on", from).order("id")),
    // Weeks that were given a goal of their own.
    db.from("study_weeks").select("week_start, goal_hours").gte("week_start", addDays(from, -6)).then(must),
  ]);
  const courseOfTopic = new Map(topics.map((t) => [t.id, t.course_id]));
  const sessions: ProgressSession[] = blocks.map((b) => ({
    date: addDays(b.week_start, Number(b.weekday)),
    hours: Number(b.hours),
    course_id: b.topic_id ? (courseOfTopic.get(b.topic_id) ?? null) : null,
    library: Boolean(b.resource_id) && !b.topic_id,
  }));
  return buildProgress({
    today,
    weeklyGoal,
    weekGoals: Object.fromEntries(weeks.filter((w) => w.goal_hours !== null).map((w) => [w.week_start, Number(w.goal_hours)])),
    sessions,
    topicDays: doneTopics.filter((t) => t.completed_at).map((t) => dateIn(new Date(t.completed_at as string), zone)),
    itemDays: doneItems.filter((r) => r.completed_on).map((r) => r.completed_on as string),
    courseTitles: Object.fromEntries(courses.map((c) => [c.id, c.title])),
  });
}
