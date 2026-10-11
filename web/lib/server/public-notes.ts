// The public page of a course's notes: what it may read from the database. The page has no sign-in, so it asks the database
// function public_course_notes, which answers only for an exact link code (and returns the title, the notes and their time, nothing else).
import { isLinkCode } from "../linkify.ts";
import { must } from "./http.ts";
import { getAuthClient } from "./supabase.ts";

export type PublicNotes = { title: string; notes: string; updated_at: string | null };

/** The notes behind a link code, or null when the code is not one, or no course is public under it (turned off, deleted …). */
export async function loadPublicNotes(token: string): Promise<PublicNotes | null> {
  if (!isLinkCode(token)) return null;
  const rows = must(await getAuthClient().rpc("public_course_notes", { p_token: token.toLowerCase() }));
  return rows[0] ?? null;
}
