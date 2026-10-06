// Deleting in this app means: move it to the Archive. It stays there until it is deleted from the Archive page.
import type { Db } from "./supabase.ts";
import { must } from "./http.ts";

/** What can be archived; the database function archive_delete knows the same list. */
export type ArchiveKind =
  | "task" | "note" | "event" | "goal" | "milestone" | "habit" | "course" | "unit" | "topic"
  | "study_block" | "transaction" | "bill" | "budget_category" | "category" | "reminder" | "job";

/** Moves one item (with what goes with it: a goal's milestones, a course's units and topics …) into the Archive. */
export async function archiveItem(db: Db, kind: ArchiveKind, id: string) {
  must(await db.rpc("archive_delete", { p_kind: kind, p_id: id }));
}
