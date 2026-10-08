// Learning → "Study next": what to study today, whether a course is behind, when it will finish at your pace,
// and how steady your weeks are. Worked out from the topics and the finished study sessions (never stored).
// Plain functions with no React, so the pages, the server and the tests all use them.
import { currentWeek, doneHours } from "./course.ts";
import { addDays, daysBetween, formatDate } from "./dates.ts";

export type StudyTopic = {
  id: string;
  course_id: string;
  unit_id: string;
  code: string;
  title: string;
  status: string;
  est_hours: number;
  actual_hours: number;
  planned_week: number | null;
  /** Where the topic's unit sits in the course, then where the topic sits in its unit: the order to study in. */
  unit_position: number;
  position: number;
};
export type StudyCourse = { id: string; title: string; start_date: string; target_date: string };

/** Why a topic is on the list: planned for an earlier week and not finished, planned for this week, already started, or simply the next one. */
export type StudyReason = "overdue" | "this-week" | "in-progress" | "next";
export type NextTopic = { topic: StudyTopic; course: StudyCourse; reason: StudyReason; weeksLate: number; hoursLeft: number };

const REASON_ORDER: Record<StudyReason, number> = { overdue: 0, "this-week": 1, "in-progress": 2, next: 3 };
const round2 = (n: number) => Math.round(n * 100) / 100;
const facts = (c: StudyCourse) => ({ start_date: c.start_date, target_date: c.target_date, weekly_plan: [] as number[] });

/** Hours of a topic still to do. */
export const hoursLeft = (t: Pick<StudyTopic, "status" | "est_hours" | "actual_hours">) => Math.max(0, round2(Number(t.est_hours) - doneHours({ ...t, planned_week: null })));

/** Why an unfinished topic is worth studying now (null for a finished one). `week` is the course's current week. */
export function topicReason(t: Pick<StudyTopic, "status" | "planned_week">, week: number): StudyReason | null {
  if (t.status === "done") return null;
  if (t.planned_week != null && t.planned_week < week) return "overdue";
  if (t.planned_week === week) return "this-week";
  return t.status === "in-progress" ? "in-progress" : "next";
}

const byOrder = (a: StudyTopic, b: StudyTopic) => a.unit_position - b.unit_position || a.position - b.position || a.code.localeCompare(b.code, undefined, { numeric: true });

/**
 * Every unfinished topic of the courses that have started, best first: what is behind comes first (the oldest week first),
 * then this week's plan (what you already started before the rest), then what you started, then the rest in course order.
 */
export function rankTopics(courses: StudyCourse[], topics: StudyTopic[], today: string): NextTopic[] {
  const list: NextTopic[] = [];
  for (const course of courses) {
    if (today < course.start_date) continue; // not started yet
    const week = currentWeek(facts(course), today);
    for (const topic of topics) {
      if (topic.course_id !== course.id) continue;
      const reason = topicReason(topic, week);
      if (!reason) continue;
      list.push({ topic, course, reason, weeksLate: reason === "overdue" ? week - (topic.planned_week ?? week) : 0, hoursLeft: hoursLeft(topic) });
    }
  }
  return list.sort((a, b) => {
    if (a.reason !== b.reason) return REASON_ORDER[a.reason] - REASON_ORDER[b.reason];
    if (a.reason === "overdue" && a.topic.planned_week !== b.topic.planned_week) return (a.topic.planned_week ?? 0) - (b.topic.planned_week ?? 0);
    if (a.reason === "this-week" && a.topic.status !== b.topic.status) return a.topic.status === "in-progress" ? -1 : 1;
    // Between courses, the one due first goes first.
    return a.course.target_date.localeCompare(b.course.target_date) || a.course.id.localeCompare(b.course.id) || byOrder(a.topic, b.topic);
  });
}

/** The few to show: at most `limit`, and not more than `perCourse` from one course, so one big course does not fill the list. */
export function pickNext(ranked: NextTopic[], limit = 3, perCourse = 2): NextTopic[] {
  const taken = new Map<string, number>();
  const picked: NextTopic[] = [];
  for (const item of ranked) {
    if (picked.length >= limit) break;
    const n = taken.get(item.course.id) ?? 0;
    if (n >= perCourse) continue;
    taken.set(item.course.id, n + 1);
    picked.push(item);
  }
  return picked;
}

/** "2 weeks behind", "planned for this week", "started", "next in the course". */
export function reasonText(item: Pick<NextTopic, "reason" | "weeksLate">) {
  switch (item.reason) {
    case "overdue": return item.weeksLate > 1 ? `${item.weeksLate} weeks behind` : "1 week behind";
    case "this-week": return "planned for this week";
    case "in-progress": return "already started";
    default: return "next in the course";
  }
}

export type CourseState = "empty" | "not-started" | "on-track" | "behind" | "overdue" | "done";
export type CourseHealth = { state: CourseState; behindHours: number; weeksBehind: number };

/**
 * Is the course on track? Behind = something planned for an earlier week is not finished.
 * A course with no weekly plan on its topics is judged by time instead: behind when the share of the course that
 * should be done by now (days gone / days in total) is ahead of what is done by at least 15% of the course (and 2 hours),
 * so a week without study on a course with no plan does not already count as behind.
 */
export function courseHealth(
  course: Pick<StudyCourse, "start_date" | "target_date">,
  topics: Pick<StudyTopic, "status" | "est_hours" | "actual_hours" | "planned_week">[],
  today: string,
): CourseHealth {
  const total = topics.reduce((sum, t) => sum + Number(t.est_hours), 0);
  const left = topics.reduce((sum, t) => sum + Number(t.est_hours) - doneHours(t), 0);
  const none = { behindHours: 0, weeksBehind: 0 };
  if (!topics.length || total <= 0) return { state: "empty", ...none };
  if (left <= 0) return { state: "done", ...none };
  if (today < course.start_date) return { state: "not-started", ...none };
  if (today > course.target_date) return { state: "overdue", behindHours: round2(left), weeksBehind: 0 };

  const week = currentWeek({ ...course, weekly_plan: [] }, today);
  const late = topics.filter((t) => t.status !== "done" && t.planned_week != null && t.planned_week < week);
  if (late.length) {
    return {
      state: "behind",
      behindHours: round2(late.reduce((sum, t) => sum + Number(t.est_hours) - doneHours(t), 0)),
      weeksBehind: Math.max(...late.map((t) => week - (t.planned_week ?? week))),
    };
  }
  if (topics.every((t) => t.planned_week == null)) {
    const span = daysBetween(course.start_date, course.target_date) + 1;
    const expected = total * Math.min(1, daysBetween(course.start_date, today) / span);
    const behindHours = expected - (total - left);
    if (behindHours >= Math.max(2, total * 0.15)) return { state: "behind", behindHours: round2(behindHours), weeksBehind: 0 };
  }
  return { state: "on-track", ...none };
}

/** A finished study session, as the database keeps it. */
export type DoneBlock = { week_start: string; weekday: number; hours: number; topic_id: string | null };
export const blockDate = (b: Pick<DoneBlock, "week_start" | "weekday">) => addDays(b.week_start, b.weekday);

/**
 * Hours per week you really study a course at: the finished sessions on its topics over the last 4 weeks.
 * A newcomer is not averaged against weeks before the first session. Null when there is nothing to go on.
 */
export function weeklyPace(blocks: DoneBlock[], topicIds: Set<string>, today: string, weeks = 4): number | null {
  const from = addDays(today, -(weeks * 7 - 1));
  const mine = blocks.filter((b) => b.topic_id && topicIds.has(b.topic_id) && blockDate(b) >= from && blockDate(b) <= today);
  const hours = mine.reduce((sum, b) => sum + Number(b.hours), 0);
  if (hours <= 0) return null;
  const first = mine.reduce((min, b) => (blockDate(b) < min ? blockDate(b) : min), today);
  const span = Math.min(weeks, Math.max(1, (daysBetween(first, today) + 1) / 7));
  return hours / span;
}

/** When the course would finish at this pace, and how many days after the target date that is (negative = early). Null when it cannot be told. */
export function forecastFinish(left: number, pace: number | null, today: string, target: string): { date: string; daysLate: number } | null {
  if (left <= 0 || !pace || pace <= 0) return null;
  const days = Math.ceil((left / pace) * 7);
  if (days > 156 * 7) return null; // years away: more a sign of no pace than a forecast
  const date = addDays(today, days);
  return { date, daysLate: daysBetween(target, date) };
}

/** "At your pace: done by 12 Dec (on time)" / "… 3 days after the target". */
export function forecastText(f: { date: string; days_late: number }) {
  const when = formatDate(f.date, "date");
  if (f.days_late <= 0) return `At your pace: done by ${when} (on time)`;
  return `At your pace: ${when} (${f.days_late} ${f.days_late === 1 ? "day" : "days"} after the target)`;
}

/** Finished hours of each study week (Monday → hours). */
export function hoursByWeek(blocks: Pick<DoneBlock, "week_start" | "hours">[]) {
  const map = new Map<string, number>();
  for (const b of blocks) map.set(b.week_start, (map.get(b.week_start) ?? 0) + Number(b.hours));
  return map;
}

/**
 * Weeks in a row with some study, counting back from this week. This week not having a session yet does not break it
 * (the week is not over), so counting then starts from last week.
 */
export function weekStreak(byWeek: Map<string, number>, thisWeek: string) {
  let week = (byWeek.get(thisWeek) ?? 0) > 0 ? thisWeek : addDays(thisWeek, -7);
  let count = 0;
  while ((byWeek.get(week) ?? 0) > 0) {
    count += 1;
    week = addDays(week, -7);
  }
  return count;
}

/** The last `count` weeks, oldest first, with their hours (0 for a quiet week). */
export function recentWeeks(byWeek: Map<string, number>, thisWeek: string, count = 8) {
  return Array.from({ length: count }, (_, i) => {
    const week = addDays(thisWeek, -7 * (count - 1 - i));
    return { week_start: week, hours: round2(byWeek.get(week) ?? 0) };
  });
}

/** The text a session gets when you pick a topic: "2.1 SQL joins" (kept within the 200 letters a session may have). */
export const sessionLabel = (t: Pick<StudyTopic, "code" | "title">) => `${t.code} ${t.title}`.trim().slice(0, 200);
