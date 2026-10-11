import { handle } from "@/lib/server/api";
import { must } from "@/lib/server/http";
import { CourseNotes } from "@/lib/server/schemas";
import { nonEmpty, parse, s } from "@/lib/server/validate";

/**
 * Saves the notes of a course and/or turns their public link on or off. `public: true` makes a new secret link code (the same
 * one is kept if the notes are already public); `public: false` removes it, so the old link stops working at once.
 * Only the notes and the code are touched here: the rest of the course is never sent with them.
 */
export const PATCH = handle<{ id: string }>(async ({ db, params, body }) => {
  const id = parse(s.id, params.id);
  const input = nonEmpty(parse(CourseNotes, await body()));
  const changes: { notes?: string; notes_share?: string | null } = {};
  if (input.notes !== undefined) changes.notes = input.notes;
  if (input.public === false) changes.notes_share = null;
  if (input.public === true) {
    const current = must(await db.from("courses").select("notes_share").eq("id", id).single());
    changes.notes_share = current.notes_share ?? crypto.randomUUID();
  }
  const course = must(await db.from("courses").update(changes).eq("id", id).select("id, notes, notes_share, notes_updated_at").single());
  return course;
});
