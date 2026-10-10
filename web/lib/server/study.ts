// Learning → what to study next, worked out from the courses and the finished study sessions.
import { forecastFinish, hoursByWeek, isActiveCourse, pickNext, rankTopics, recentWeeks, sessionLabel, weekStreak, weeklyPace, hoursLeft, type StudyTopic } from "../study.ts";
import { revisionDue, type RevisionCandidate } from "../revision.ts";
import type { OpenTopic, StudyNextItem } from "../types.ts";
import { addDays, dateIn, mondayOf, startOfDayUtc } from "./dates.ts";
import { dbError, HttpError, must } from "./http.ts";
import { fetchAll } from "./paging.ts";
import { loadCourseFacts, summariseCourses } from "./queries.ts";
import type { Db } from "./supabase.ts";

/** How many unfinished topics the "Log a study session" picker is given (a very big course list is cut, best first). */
const MAX_OPEN_TOPICS = 300;
/** How far back the finished sessions are read every time: 11 weeks before this one (the last 8 weeks, and the pace). */
const LOOK_BACK_DAYS = 77;
/** Finished topics and items older than this have no look-back left to do (the last one is due after 21 days, and is let go after 30 more). */
const REVISION_LOOK_BACK_DAYS = 60;
/** A streak that reaches the start of that window is followed further back, up to 3 years. */
const STREAK_LIMIT_WEEKS = 156;

/**
 * The Learning page's numbers beyond the week itself: every course (behind or not, and when it would finish at your pace),
 * the few topics to study next, the topics you can pick for a session, the library items in progress, and the streak.
 */
export async function studyOverview(db: Db, today: string, zone = "UTC") {
  const thisWeek = mondayOf(today);
  const [facts, blocks, library, doneTopics, doneItems] = await Promise.all([
    loadCourseFacts(db),
    fetchAll(() => db.from("study_blocks").select("id, week_start, weekday, hours, topic_id").eq("done", true).gte("week_start", addDays(thisWeek, -LOOK_BACK_DAYS)).order("id")),
    db.from("learning_resources").select("id, title").eq("status", "learning").order("created_at").limit(50).then(must),
    // Finished in the last 2 months and not looked at 3 times yet: the candidates for revision.
    db.from("course_topics").select("id, course_id, code, title, completed_at, revision_step").eq("status", "done").lt("revision_step", 3).gte("completed_at", startOfDayUtc(addDays(today, -REVISION_LOOK_BACK_DAYS), zone)).then(must),
    db.from("learning_resources").select("id, title, platform, provider, completed_on, revision_step").eq("status", "completed").lt("revision_step", 3).gte("completed_on", addDays(today, -REVISION_LOOK_BACK_DAYS)).then(must),
  ]);

  const unitPosition = new Map(facts.units.map((u) => [u.id, u.position]));
  const topics: StudyTopic[] = facts.topics.map((t) => ({
    id: t.id,
    course_id: t.course_id,
    unit_id: t.unit_id,
    code: t.code,
    title: t.title,
    status: t.status,
    est_hours: Number(t.est_hours),
    actual_hours: Number(t.actual_hours),
    planned_week: t.planned_week,
    unit_position: unitPosition.get(t.unit_id) ?? 0,
    position: t.position,
  }));
  const ranked = rankTopics(facts.courses.filter(isActiveCourse), topics, today);
  let byWeek = hoursByWeek(blocks);
  if (weekStreak(byWeek, thisWeek) >= LOOK_BACK_DAYS / 7) {
    // Every week in the window had study: the streak may go on beyond it, so read the older sessions too.
    const older = await fetchAll(() =>
      db.from("study_blocks").select("id, week_start, hours").eq("done", true).lt("week_start", addDays(thisWeek, -LOOK_BACK_DAYS)).gte("week_start", addDays(thisWeek, -7 * STREAK_LIMIT_WEEKS)).order("id"),
    );
    byWeek = hoursByWeek([...blocks, ...older]);
  }

  const courses = summariseCourses(facts, today).map((course) => {
    const mine = new Set(topics.filter((t) => t.course_id === course.id).map((t) => t.id));
    const left = course.est_hours - course.done_hours;
    const finish = forecastFinish(left, weeklyPace(blocks, mine, today), today, course.target_date);
    return { ...course, forecast: finish && { date: finish.date, days_late: finish.daysLate } };
  });

  const asNext = (item: (typeof ranked)[number]): StudyNextItem => ({
    topic_id: item.topic.id,
    course_id: item.course.id,
    course_title: item.course.title,
    course_color: (facts.courses.find((c) => c.id === item.course.id)?.color ?? "blue") as StudyNextItem["course_color"],
    code: item.topic.code,
    title: item.topic.title,
    status: item.topic.status as StudyNextItem["status"],
    est_hours: item.topic.est_hours,
    hours_left: item.hoursLeft,
    planned_week: item.topic.planned_week,
    reason: item.reason,
    weeks_late: item.weeksLate,
  });
  const open: OpenTopic[] = ranked.slice(0, MAX_OPEN_TOPICS).map((item) => ({
    id: item.topic.id,
    course_id: item.course.id,
    label: sessionLabel(item.topic),
    status: item.topic.status as OpenTopic["status"],
    hours_left: hoursLeft(item.topic),
  }));

  const courseTitle = new Map(facts.courses.map((c) => [c.id, c.title]));
  const candidates: RevisionCandidate[] = [
    ...doneTopics.filter((t) => t.completed_at).map((t) => ({ kind: "topic" as const, id: t.id, title: sessionLabel(t), label: courseTitle.get(t.course_id) ?? "", step: Number(t.revision_step ?? 0), finishedOn: dateIn(new Date(t.completed_at!), zone), href: `/learning/${t.course_id}` })),
    ...doneItems.filter((r) => r.completed_on).map((r) => ({ kind: "resource" as const, id: r.id, title: r.title, label: r.provider || r.platform || "", step: Number(r.revision_step ?? 0), finishedOn: r.completed_on!, href: "/learning/library" })),
  ];

  return {
    courses,
    study_next: pickNext(ranked).map(asNext),
    open_topics: open,
    library,
    stats: { streak: weekStreak(byWeek, thisWeek), weeks: recentWeeks(byWeek, thisWeek, 8) },
    /** Topics and library items finished a day, a week or three weeks ago that are due to be looked at again. */
    revision: revisionDue(candidates, today).slice(0, 5),
    /** Unfinished topics planned for an earlier week. */
    late: ranked.filter((i) => i.reason === "overdue").length,
  };
}

/** A session may only name a topic or a library item of yours: anything else is a 400 (the database would accept another account's id). */
export async function checkBlockLinks(db: Db, links: { topic_id?: string | null; resource_id?: string | null }) {
  if (links.topic_id) {
    const { data, error } = await db.from("course_topics").select("id").eq("id", links.topic_id).maybeSingle();
    if (error) throw dbError(error); // a database problem is not "that topic is not yours"
    if (!data) throw new HttpError(400, "That topic is not in your courses.");
  }
  if (links.resource_id) {
    const { data, error } = await db.from("learning_resources").select("id").eq("id", links.resource_id).maybeSingle();
    if (error) throw dbError(error);
    if (!data) throw new HttpError(400, "That item is not in your library.");
  }
}
