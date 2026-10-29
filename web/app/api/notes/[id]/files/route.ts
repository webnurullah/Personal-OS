import { handle } from "@/lib/server/api";
import { HttpError, must } from "@/lib/server/http";
import { cleanName, filePath, NOTE_FILE_BUCKET, NOTE_FILE_MAX_BYTES, NOTE_FILES_PER_NOTE, presentFiles, removeNoteFiles, sniffNoteFile, tooLarge, tooManyFiles } from "@/lib/server/note-files";
import { parse, s } from "@/lib/server/validate";

/**
 * Keeps a picture or a PDF with a note. The body is the file itself (the app sends a PDF as it is and a picture as a JPEG made
 * from your photo), not JSON; the name you knew it by comes in `?name=`. What the file is, is read from its own first bytes.
 * It is stored in your own folder under a new random name, and only then does the note list it; if listing fails the stored file is removed again.
 */
export const POST = handle<{ id: string }>(async ({ db, user, params, req, query }) => {
  const noteId = parse(s.id, params.id);
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > NOTE_FILE_MAX_BYTES) throw new HttpError(413, tooLarge);
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (!bytes.length) throw new HttpError(400, "Choose a file first.");
  if (bytes.length > NOTE_FILE_MAX_BYTES) throw new HttpError(413, tooLarge);
  const kind = sniffNoteFile(bytes);
  if (!kind) throw new HttpError(400, "That file is not a JPG, PNG or WebP picture or a PDF.");

  // The note is yours (another person's note is simply not found) and has room for one more file.
  must(await db.from("notes").select("id").eq("id", noteId).single());
  const have = await db.from("note_files").select("id", { count: "exact", head: true }).eq("note_id", noteId);
  if (have.error) {
    // The database step for files has not been run yet.
    if (have.error.code === "PGRST205" || have.error.code === "42P01") throw new HttpError(503, "Files in notes are not set up in the database yet. Run the newest database step (20261029000000_note_files.sql), then try again.");
    must(have);
  }
  if ((have.count ?? 0) >= NOTE_FILES_PER_NOTE) throw new HttpError(409, tooManyFiles);

  const path = filePath(user.id, kind.ext, crypto.randomUUID());
  const stored = await db.storage.from(NOTE_FILE_BUCKET).upload(path, bytes, { contentType: kind.type, cacheControl: "31536000", upsert: false });
  if (stored.error) {
    console.error("Note file upload failed", stored.error);
    throw new HttpError(502, "The file could not be saved. Please try again.", stored.error.message);
  }
  let row;
  try {
    row = must(await db.from("note_files").insert({ note_id: noteId, kind: kind.kind, name: cleanName(query.name, kind.ext), path, size_bytes: bytes.length }).select("id, note_id, kind, name, path, size_bytes, created_at").single());
  } catch (error) {
    await removeNoteFiles(db, user.id, [path]);
    throw error;
  }
  const [file] = await presentFiles(db, user.id, [row]);
  return file;
}, { status: 201 });
