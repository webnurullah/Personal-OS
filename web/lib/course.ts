// Course tracker numbers, worked out from the topics (the facts).
// Runs in the browser so the page updates while you type.

type TopicFacts = { status: string; est_hours: number; actual_hours: number; planned_week: number | null };
type UnitFacts<T extends TopicFacts> = { id: string; topics: T[] };
type CourseFacts = { start_date: string; target_date: string; weekly_plan: number[] };

const DAY_MS = 86400000;
const toMs = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const daysBetween = (a: string, b: string) => Math.round((toMs(b) - toMs(a)) / DAY_MS);
const sum = <T,>(list: T[], value: (item: T) => number) => list.reduce((total, item) => total + value(item), 0);
const percent = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

/** Work finished on a topic: all of it once done, otherwise the time spent (never more than the estimate). */
export const doneHours = (t: TopicFacts) => (t.status === "done" ? Number(t.est_hours) : Math.min(Number(t.actual_hours), Number(t.est_hours)));

/** Number of weeks from the start date to the target date. */
export const courseWeeks = (c: CourseFacts) => Math.max(1, Math.ceil((daysBetween(c.start_date, c.target_date) + 1) / 7));

/** Which course week today is in (1 … last week). */
export function currentWeek(c: CourseFacts, today: string) {
  const week = Math.floor(daysBetween(c.start_date, today) / 7) + 1;
  return Math.min(courseWeeks(c), Math.max(1, week));
}

export function courseStats<T extends TopicFacts, U extends UnitFacts<T>>(course: CourseFacts, units: U[], today: string) {
  const topics = units.flatMap((u) => u.topics);
  const total = sum(topics, (t) => Number(t.est_hours));
  const done = sum(topics, doneHours);
  const spent = sum(topics, (t) => Number(t.actual_hours));
  const left = total - done;
  const progress = percent(done, total);
  const leftWhere = (status: string) => sum(topics.filter((t) => t.status === status), (t) => Number(t.est_hours) - doneHours(t));

  const weeks = courseWeeks(course);
  const plan = Array.from({ length: weeks }, (_, i) => Number(course.weekly_plan[i] ?? 0));
  const actualByWeek = Array.from({ length: weeks }, (_, i) => sum(topics.filter((t) => t.planned_week === i + 1), (t) => Number(t.actual_hours)));
  const plannedTotal = sum(plan, (h) => h);
  const daysLeft = daysBetween(today, course.target_date);
  const thisWeek = currentWeek(course, today);

  return {
    total,
    done,
    spent,
    left,
    progress,
    ring: { done, inProgress: leftWhere("in-progress"), notStarted: leftWhere("not-started") },
    units: units.map((unit) => ({ unit, est: sum(unit.topics, (t) => Number(t.est_hours)), percent: percent(sum(unit.topics, doneHours), sum(unit.topics, (t) => Number(t.est_hours))) })),
    weeks,
    thisWeek,
    weekTopics: topics.filter((t) => t.planned_week === thisWeek),
    plan,
    actualByWeek,
    plannedTotal,
    daysLeft,
    /** Hours per week still needed to finish on time (null when done or past the date). */
    pace: left > 0 && daysLeft > 0 ? left / (daysLeft / 7) : null,
  };
}
