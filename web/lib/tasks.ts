// When a task counts as "today", "upcoming" or "overdue". Used by the pages and the API,
// so both always agree. A task has a due date, and optionally an end date when it runs over several days.
import { formatDate, relativeDay } from "./dates.ts";

type Dated = { due_date: string | null; end_date: string | null; done_at?: string | null };

/** The day the task is (finally) due: its end date, or its due date. */
export const lastDay = (t: Dated) => t.end_date ?? t.due_date;

/** On the list for this day: the day falls within the task's dates. */
export const isOnDay = (t: Dated, day: string) => Boolean(t.due_date && t.due_date <= day && day <= (t.end_date ?? t.due_date));

/** Not done, and its last day has passed. */
export const isOverdue = (t: Dated, today: string) => !t.done_at && Boolean(t.due_date && (t.end_date ?? t.due_date) < today);

/** Not done, and it has not started yet. */
export const isUpcoming = (t: Dated, today: string) => !t.done_at && Boolean(t.due_date && t.due_date > today);

const lower = (label: string) => (["Today", "Tomorrow", "Yesterday"].includes(label) ? label.toLowerCase() : label);

/** "Today", "Friday", "Ends Friday" (running now) or "Oct 8 – Oct 10". */
export function taskDateLabel(t: Dated, today: string) {
  if (!t.due_date) return "No date";
  if (!t.end_date || t.end_date === t.due_date) return relativeDay(t.due_date, today);
  if (t.due_date <= today && today <= t.end_date) return `Ends ${lower(relativeDay(t.end_date, today))}`;
  return `${formatDate(t.due_date, "short")} – ${formatDate(t.end_date, "short")}`;
}
