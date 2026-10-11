import { handle } from "@/lib/server/api";
import { must } from "@/lib/server/http";
import { CourseNotes } from "@/lib/server/schemas";
import { parse, s } from "@/lib/server/validate";

/**
 * Saves the notes of a course (what the text editor on the course page holds). Only the notes are touched, and the answer carries
 * only the notes and the time they changed: the rest of the course is never sent with them.
 */
export const PATCH = handle<{ id: string }>(async ({ db, params, body }) => {
  const id = parse(s.id, params.id);
  const { notes } = parse(CourseNotes, await body());
  return must(await db.from("courses").update({ notes }).eq("id", id).select("id, notes, notes_updated_at").single());
});
