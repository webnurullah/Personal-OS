// Notes: the pictures and PDFs kept with a note. They live in a private Storage bucket (one folder per person, a new random
// file name for every upload); the table note_files remembers each one. The app receives a short-lived signed address for a
// picture (so it can show it with a plain <img>), and asks for one when it opens a PDF.
import { NOTE_FILE_MAX_BYTES, NOTE_FILES_PER_NOTE } from "../note-files.ts";
import { ownsAvatar as ownsFile, sniffImage } from "./avatar.ts";
import { dbError } from "./http.ts";
import type { Db, Row } from "./supabase.ts";

export const NOTE_FILE_BUCKET = "note-files";
export { NOTE_FILE_MAX_BYTES, NOTE_FILES_PER_NOTE, ownsFile };

/** How long a picture's address in the notes list works (the screen asks for a new one when it stops working). */
const LIST_URL_SECONDS = 24 * 60 * 60;
/** How long the address of a file that is being opened works. */
const OPEN_URL_SECONDS = 10 * 60;

/** A new file name for every upload, inside the person's own folder. */
export const filePath = (userId: string, ext: StoredKind["ext"], id: string) => `${userId}/${id}.${ext}`;

export type StoredKind = { kind: "image" | "pdf"; type: "image/jpeg" | "image/png" | "image/webp" | "application/pdf"; ext: "jpg" | "png" | "webp" | "pdf" };

/** Tells what a file is from its first bytes (never from its name or the header the browser sent): a JPG, PNG or WebP picture, or a PDF. */
export function sniffNoteFile(bytes: Uint8Array): StoredKind | null {
  const picture = sniffImage(bytes);
  if (picture) return { kind: "image", ...picture };
  // A PDF starts with "%PDF-" (readers accept it anywhere in the first 1024 bytes).
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
  if (head.includes("%PDF-")) return { kind: "pdf", type: "application/pdf", ext: "pdf" };
  return null;
}

/** The name to remember for an uploaded file: no folders, no control characters, at most 200 characters, always the right ending. */
export function cleanName(raw: string | null | undefined, ext: StoredKind["ext"]) {
  const base = (raw ?? "")
    .replace(/[\\/\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.(jpe?g|png|webp|pdf)$/i, "")
    .replace(/^[.\s]+/, "");
  const stem = Array.from(base || (ext === "pdf" ? "Document" : "Picture")).slice(0, 190).join("");
  return `${stem}.${ext}`;
}

export type NoteFile = {
  id: string;
  note_id: string;
  kind: "image" | "pdf";
  name: string;
  size_bytes: number;
  created_at: string;
  /** A signed address for a picture (null for a PDF, which is opened on demand, and when the address could not be made). */
  url: string | null;
};

const COLUMNS = "id, note_id, kind, name, path, size_bytes, created_at";
type Stored = Pick<Row<"note_files">, "id" | "note_id" | "kind" | "name" | "path" | "size_bytes" | "created_at">;

/** The files as the app receives them: the storage path is replaced by a signed address (pictures only). */
export async function presentFiles(db: Db, userId: string, rows: Stored[]): Promise<NoteFile[]> {
  const pictures = rows.filter((r) => r.kind === "image" && ownsFile(userId, r.path));
  const urls = new Map<string, string>();
  if (pictures.length) {
    const { data, error } = await db.storage.from(NOTE_FILE_BUCKET).createSignedUrls(pictures.map((r) => r.path), LIST_URL_SECONDS);
    if (error) console.error("Could not make addresses for note pictures", error);
    for (const entry of data ?? []) if (entry.signedUrl && entry.path) urls.set(entry.path, entry.signedUrl);
  }
  return rows.map(({ path, ...file }) => ({ ...file, kind: file.kind as NoteFile["kind"], url: urls.get(path) ?? null }));
}

/**
 * Every file of this person, grouped by note. When the database step for files has not been run yet the table does not exist:
 * the notes still work, just without files.
 */
export async function filesByNote(db: Db, userId: string): Promise<Map<string, NoteFile[]>> {
  const rows: Stored[] = [];
  for (let from = 0; ; from += 1000) {
    const page = await db.from("note_files").select(COLUMNS).order("created_at").order("id").range(from, from + 999);
    if (page.error) {
      if (page.error.code === "PGRST205" || page.error.code === "42P01") return new Map();
      throw dbError(page.error);
    }
    rows.push(...page.data);
    if (page.data.length < 1000) break;
  }
  const grouped = new Map<string, NoteFile[]>();
  for (const file of await presentFiles(db, userId, rows)) grouped.set(file.note_id, [...(grouped.get(file.note_id) ?? []), file]);
  return grouped;
}

/** Signed addresses to look at a file (and to save it under its own name), valid for a few minutes. */
export async function openAddresses(db: Db, userId: string, file: Pick<Row<"note_files">, "path" | "name">) {
  if (!ownsFile(userId, file.path)) return null;
  const bucket = db.storage.from(NOTE_FILE_BUCKET);
  const [view, download] = await Promise.all([bucket.createSignedUrl(file.path, OPEN_URL_SECONDS), bucket.createSignedUrl(file.path, OPEN_URL_SECONDS, { download: file.name })]);
  if (view.error || download.error || !view.data?.signedUrl || !download.data?.signedUrl) {
    console.error("Could not make an address for a note file", view.error ?? download.error);
    return null;
  }
  return { url: view.data.signedUrl, download_url: download.data.signedUrl };
}

/** Forget stored files that are no longer used. A leftover file is harmless, so a failure here is only logged. */
export async function removeNoteFiles(db: Db, userId: string, paths: (string | null | undefined)[]) {
  const own = paths.filter((path): path is string => ownsFile(userId, path));
  if (!own.length) return;
  const { error } = await db.storage.from(NOTE_FILE_BUCKET).remove(own);
  if (error) console.error("Could not remove note files", error);
}

/** Removes every note file of this person (used by "delete all my data"). Only logged when it fails. */
export async function removeAllNoteFiles(db: Db, userId: string) {
  const bucket = db.storage.from(NOTE_FILE_BUCKET);
  for (let round = 0; round < 50; round++) {
    const { data, error } = await bucket.list(userId, { limit: 100 });
    if (error) {
      console.error("Could not list note files", error);
      return;
    }
    if (!data?.length) return;
    const removed = await bucket.remove(data.map((file) => `${userId}/${file.name}`));
    if (removed.error) {
      console.error("Could not remove note files", removed.error);
      return;
    }
  }
}

/** The stored paths of the files saved with a note in the Archive (the saved copy is `{ children: { note_files: [rows] } }`). */
export function archivedFilePaths(data: unknown): string[] {
  const rows = (data as { children?: { note_files?: unknown } } | null)?.children?.note_files;
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => (row as { path?: unknown } | null)?.path).filter((path): path is string => typeof path === "string");
}

export const tooManyFiles = `A note can keep up to ${NOTE_FILES_PER_NOTE} files. Remove one first.`;
export const tooLarge = `That file is too large. A file can be up to ${NOTE_FILE_MAX_BYTES / (1024 * 1024)} MB.`;
