import { handle, ok } from "@/lib/server/api";
import { HttpError, must } from "@/lib/server/http";
import { openAddresses, removeNoteFiles } from "@/lib/server/note-files";
import { parse, s } from "@/lib/server/validate";

/** Addresses to look at a file and to save it, valid for a few minutes (a PDF is opened this way; a picture asks again when its list address stops working). */
export const GET = handle<{ id: string; fileId: string }>(async ({ db, user, params }) => {
  const noteId = parse(s.id, params.id);
  const fileId = parse(s.id, params.fileId);
  const file = must(await db.from("note_files").select("path, name").eq("id", fileId).eq("note_id", noteId).single());
  const addresses = await openAddresses(db, user.id, file);
  if (!addresses) throw new HttpError(502, "This file could not be opened. Please try again.");
  return addresses;
});

/** Removes a file from a note, and deletes the stored file for good (a file taken off on its own does not go to the Archive). */
export const DELETE = handle<{ id: string; fileId: string }>(async ({ db, user, params }) => {
  const noteId = parse(s.id, params.id);
  const fileId = parse(s.id, params.fileId);
  const file = must(await db.from("note_files").delete().eq("id", fileId).eq("note_id", noteId).select("path").single());
  await removeNoteFiles(db, user.id, [file.path]);
  return ok;
});
