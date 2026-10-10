// Learning → progress and time by week, month and quarter: the hours you studied against your weekly goal, how many days
// you studied, what you finished and where the time went. Plain functions: the server feeds them the rows, the page draws
// the answer, the tests check them.
import { addDays, daysBetween, formatDate, mondayOf } from "./dates.ts";

export type PeriodKind = "week" | "month" | "quarter";
/** How many periods of each kind are shown (the current one is the last). */
export const PERIOD_COUNTS: Record<PeriodKind, number> = { week: 8, month: 6, quarter: 4 };

export type Period = { kind: PeriodKind; start: string; end: string; label: string; short: string };

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad2 = (n: number) => String(n).padStart(2, "0");
const lastDayOfMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate(); // month is 1-12

/** Months since year 0 -> { year, month 1-12 }. */
const fromMonthIndex = (index: number) => ({ year: Math.floor(index / 12), month: (index % 12) + 1 });

/** The week (Monday to Sunday), month or quarter (Jan-Mar, Apr-Jun, Jul-Sep, Oct-Dec) that holds `date`. */
export function periodOf(kind: PeriodKind, date: string): Period {
  if (kind === "week") {
    const start = mondayOf(date);
    const end = addDays(start, 6);
    return { kind, start, end, label: `${formatDate(start, "short")} – ${formatDate(end, "short")}`, short: formatDate(start, "short") };
  }
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  if (kind === "month") {
    return { kind, start: `${year}-${pad2(month)}-01`, end: `${year}-${pad2(month)}-${pad2(lastDayOfMonth(year, month))}`, label: formatDate(`${year}-${pad2(month)}-01`, "month"), short: MONTH_SHORT[month - 1] };
  }
  const quarter = Math.floor((month - 1) / 3);
  const first = quarter * 3 + 1;
  const last = first + 2;
  return { kind, start: `${year}-${pad2(first)}-01`, end: `${year}-${pad2(last)}-${pad2(lastDayOfMonth(year, last))}`, label: `Q${quarter + 1} ${year} (${MONTH_SHORT[first - 1]} – ${MONTH_SHORT[last - 1]})`, short: `Q${quarter + 1}` };
}

/** `count` periods in a row, the one holding `date` last. */
export function periodsEndingAt(kind: PeriodKind, date: string, count: number = PERIOD_COUNTS[kind]): Period[] {
  const out: Period[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    if (kind === "week") out.push(periodOf("week", addDays(date, -7 * i)));
    else {
      const here = Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;
      const { year, month } = fromMonthIndex(here - i * (kind === "month" ? 1 : 3));
      out.push(periodOf(kind, `${year}-${pad2(month)}-01`));
    }
  }
  return out;
}

/** One finished study session. `course_id` is set when it was about a topic of a course. */
export type ProgressSession = { date: string; hours: number; course_id: string | null; library: boolean };

export type ProgressInput = {
  today: string;
  /** The weekly study goal in hours (a month or a quarter has that many weeks' worth). */
  weeklyGoal: number;
  sessions: ProgressSession[];
  /** The days topics were finished on. */
  topicDays: string[];
  /** The days library items were completed on. */
  itemDays: string[];
  courseTitles: Record<string, string>;
};

export type TimeShare = { key: string; title: string; course_id: string | null; hours: number };

export type PeriodStats = Period & {
  /** Today is inside it. */
  current: boolean;
  days: number;
  /** Days of it that have passed, today included (all of them for a past period). */
  elapsed_days: number;
  hours: number;
  /** The goal for the whole period: the weekly goal times its weeks, to the half hour. */
  goal: number;
  /** Hours against the whole goal, in percent (can pass 100). */
  percent: number;
  /** Where you should be by today to reach the goal at an even pace (the whole goal for a past period). */
  expected: number;
  sessions: number;
  study_days: number;
  /** Hours per session. */
  avg_session: number;
  topics_done: number;
  items_done: number;
  /** Where the hours went, biggest first (at most 5; the rest are "Other courses"). */
  shares: TimeShare[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const MAX_SHARES = 5;

export function summarisePeriod(period: Period, input: ProgressInput): PeriodStats {
  const days = daysBetween(period.start, period.end) + 1;
  const current = input.today >= period.start && input.today <= period.end;
  const elapsed = input.today < period.start ? 0 : Math.min(days, daysBetween(period.start, input.today) + 1);
  const inside = input.sessions.filter((s) => s.date >= period.start && s.date <= period.end);
  const hours = round2(inside.reduce((sum, s) => sum + s.hours, 0));
  const goal = Math.round(((Math.max(0, input.weeklyGoal) * days) / 7) * 2) / 2;
  const within = (list: string[]) => list.filter((d) => d >= period.start && d <= period.end).length;

  const byKey = new Map<string, TimeShare>();
  for (const s of inside) {
    const title = s.course_id ? input.courseTitles[s.course_id] : undefined;
    const key = s.course_id && title ? `course:${s.course_id}` : s.library ? "library" : "other";
    const row = byKey.get(key) ?? { key, title: key === "library" ? "Library items" : key === "other" ? "Other study" : (title as string), course_id: key.startsWith("course:") ? (s.course_id as string) : null, hours: 0 };
    row.hours += s.hours;
    byKey.set(key, row);
  }
  const ranked = [...byKey.values()].map((r) => ({ ...r, hours: round2(r.hours) })).sort((a, b) => b.hours - a.hours || a.title.localeCompare(b.title));
  const shares = ranked.length > MAX_SHARES
    ? [...ranked.slice(0, MAX_SHARES - 1), { key: "more", title: "Other courses", course_id: null, hours: round2(ranked.slice(MAX_SHARES - 1).reduce((sum, r) => sum + r.hours, 0)) }]
    : ranked;

  return {
    ...period,
    current,
    days,
    elapsed_days: elapsed,
    hours,
    goal,
    percent: goal > 0 ? Math.round((hours / goal) * 100) : 0,
    expected: current ? Math.round(((goal * elapsed) / days) * 4) / 4 : goal,
    sessions: inside.length,
    study_days: new Set(inside.map((s) => s.date)).size,
    avg_session: inside.length ? round2(hours / inside.length) : 0,
    topics_done: within(input.topicDays),
    items_done: within(input.itemDays),
    shares,
  };
}

export type LearningProgress = Record<PeriodKind, PeriodStats[]>;

export function buildProgress(input: ProgressInput): LearningProgress {
  const kinds = Object.keys(PERIOD_COUNTS) as PeriodKind[];
  return Object.fromEntries(kinds.map((kind) => [kind, periodsEndingAt(kind, input.today).map((p) => summarisePeriod(p, input))])) as LearningProgress;
}

/** The first day that any of the periods shown covers (what the server has to read from). */
export function progressFrom(today: string) {
  return (Object.keys(PERIOD_COUNTS) as PeriodKind[]).map((k) => periodsEndingAt(k, today)[0].start).sort()[0];
}

/** "Ahead of pace by 1h", "On pace" or "Behind pace by 2h" for the current period (a quarter of an hour is on pace). */
export function paceDiff(stats: Pick<PeriodStats, "hours" | "expected">) {
  return round2(stats.hours - stats.expected);
}
