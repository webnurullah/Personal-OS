// Learning → revision: finished topics and library items come back to be looked at again 1, 7 and 21 days after they were
// finished (spaced repetition, by rules). Plain functions: the server finds the candidates, this decides which are due.
import { daysBetween } from "./dates.ts";

/** Days after finishing at which each look-back is due: the first after a day, the second after a week, the third after three weeks. */
export const REVISION_DAYS = [1, 7, 21] as const;
/** A look-back that has been due for more than this many days is let go (it was missed; it is not shown for ever). */
export const REVISION_WINDOW_DAYS = 30;
export const MAX_REVISION_STEP = REVISION_DAYS.length;

export type RevisionCandidate = { kind: "topic" | "resource"; id: string; title: string; label: string; step: number; finishedOn: string; href: string };
export type RevisionItem = RevisionCandidate & { dueAfter: number; daysSince: number; waiting: number };

/**
 * What is due to be revised today: not all three look-backs done yet, the next one's day has come, and it was not due long ago.
 * The longest-waiting first (then the one finished last).
 */
export function revisionDue(candidates: RevisionCandidate[], today: string): RevisionItem[] {
  const due: RevisionItem[] = [];
  for (const c of candidates) {
    if (c.step < 0 || c.step >= MAX_REVISION_STEP) continue;
    const dueAfter = REVISION_DAYS[c.step];
    const daysSince = daysBetween(c.finishedOn, today);
    const waiting = daysSince - dueAfter;
    if (waiting < 0 || waiting > REVISION_WINDOW_DAYS) continue;
    due.push({ ...c, dueAfter, daysSince, waiting });
  }
  return due.sort((a, b) => b.waiting - a.waiting || b.finishedOn.localeCompare(a.finishedOn) || a.title.localeCompare(b.title));
}

/** "finished yesterday", "finished 7 days ago". */
export const finishedText = (daysSince: number) => (daysSince <= 0 ? "finished today" : daysSince === 1 ? "finished yesterday" : `finished ${daysSince} days ago`);
