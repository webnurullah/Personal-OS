// The Archive: everything you delete waits there until you delete it from the Archive page.
// What each kind of item is called, where it lives in the app and what goes with it.

type Kind = { label: string; href: string; /** What goes with it, singular and plural ("milestone", "milestones"). */ related?: [string, string] };

export const ARCHIVE_KINDS: Record<string, Kind> = {
  task: { label: "Task", href: "/tasks" },
  note: { label: "Note", href: "/notes" },
  event: { label: "Event", href: "/calendar" },
  goal: { label: "Goal", href: "/goals", related: ["milestone", "milestones"] },
  milestone: { label: "Milestone", href: "/goals" },
  habit: { label: "Habit", href: "/habits", related: ["day of history", "days of history"] },
  course: { label: "Course", href: "/learning", related: ["unit or topic", "units and topics"] },
  unit: { label: "Unit", href: "/learning", related: ["topic", "topics"] },
  topic: { label: "Topic", href: "/learning" },
  study_block: { label: "Study block", href: "/learning" },
  transaction: { label: "Transaction", href: "/finance" },
  bill: { label: "Bill", href: "/finance" },
  budget_category: { label: "Money category", href: "/finance" },
  category: { label: "Category", href: "/settings?tab=categories" },
  reminder: { label: "Reminder", href: "/notes" },
  job: { label: "Job", href: "/jobs" },
  project: { label: "Project", href: "/projects", related: ["task", "tasks"] },
};

export const kindName = (kind: string) => ARCHIVE_KINDS[kind]?.label ?? "Item";

/** "3 milestones" (empty when nothing else went with it). */
export function relatedText(kind: string, count: number) {
  const nouns = ARCHIVE_KINDS[kind]?.related;
  if (!count || !nouns) return "";
  return `${count} ${count === 1 ? nouns[0] : nouns[1]}`;
}

/** What the confirmation says before something is deleted: it is not gone, it moves to the Archive. */
export const toArchive = (what: string) => `${what} will move to the Archive. You can restore it from there, or delete it for good.`;

/** What the confirmation says before an Archive entry is deleted for good. */
export function foreverMessage(title: string, kind: string, count: number) {
  const more = relatedText(kind, count);
  return `“${title}”${more ? ` and its ${more}` : ""} will be deleted forever. This cannot be undone.`;
}
