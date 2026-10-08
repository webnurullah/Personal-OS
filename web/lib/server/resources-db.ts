// Learning library: database steps shared by the endpoints.
import { must } from "./http.ts";
import type { Db } from "./supabase.ts";

/**
 * The subject of an item: a course, and optionally one of its units. A unit decides its course; a course that is
 * not yours is "not found". Returns the course_id / unit_id to save (only the keys that were sent).
 */
export async function resolveSubject(db: Db, sent: { course_id?: string | null; unit_id?: string | null }) {
  const out: { course_id?: string | null; unit_id?: string | null } = {};
  if (sent.unit_id) {
    const unit = must(await db.from("course_units").select("id, course_id").eq("id", sent.unit_id).single());
    return { course_id: unit.course_id, unit_id: unit.id };
  }
  if (sent.course_id) {
    must(await db.from("courses").select("id").eq("id", sent.course_id).single());
    out.course_id = sent.course_id;
  } else if (sent.course_id === null) {
    out.course_id = null;
  }
  if (sent.unit_id === null) out.unit_id = null;
  return out;
}
