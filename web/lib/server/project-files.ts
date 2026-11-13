// Projects: the files kept with a project (a brief, designs, a contract, pictures, PDFs, any file). They live in a private Storage
// bucket (one folder per person, a new random file name for every upload); the table project_files remembers each one. A picture
// is shown with a short-lived signed address, a PDF is drawn by the app, every other file is only downloaded.
import { PROJECT_FILES_PER_PROJECT } from "../project-files.ts";
import { NOTE_FILE_MAX_BYTES, ownsFile, sniffNoteFile } from "./note-files.ts";
import { dbError } from "./http.ts";
import type { Db, Row } from "./supabase.ts";

export const PROJECT_FILE_BUCKET = "project-files";
export const PROJECT_FILE_MAX_BYTES = NOTE_FILE_MAX_BYTES;
export { PROJECT_FILES_PER_PROJECT, ownsFile };

/** How long a picture's address in the project works (the screen asks for a new one when it stops working). */
const LIST_URL_SECONDS = 24 * 60 * 60;
/** How long the address of a file that is being opened or downloaded works. */
const OPEN_URL_SECONDS = 10 * 60;

export type ProjectFileKind = "image" | "pdf" | "file";
export type StoredProjectFile = { kind: ProjectFileKind; type: string; /** lower-case letters and digits, up to 10, or "" */ ext: string };

/**
 * Tells what a file is from its first bytes (never from the header the browser sent): a JPG, PNG or WebP picture, a PDF, or any
 * other file. Its ending (for the stored name) is the picture's or PDF's own, or else the ending of the name it came with.
 */
export function classifyProjectFile(bytes: Uint8Array, rawName: string | null | undefined): StoredProjectFile {
  const known = sniffNoteFile(bytes);
  if (known) return { kind: known.kind, type: known.type, ext: known.ext };
  const ending = /\.([A-Za-z0-9]{1,10})$/.exec((rawName ?? "").trim())?.[1] ?? "";
  return { kind: "file", type: "application/octet-stream", ext: ending.toLowerCase() };
}

/** A new file name for every upload, inside the person's own folder. */
export const projectFilePath = (userId: string, ext: string, id: string) => `${userId}/${id}${ext ? `.${ext}` : ""}`;

/** The name to remember for an uploaded file: no folders, no control characters, at most 200 characters; "File" when nothing is left. */
export function cleanProjectFileName(raw: string | null | undefined) {
  const name = (raw ?? "")
    .replace(/[\\/\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.\s]+/, "");
  return Array.from(name || "File").slice(0, 200).join("");
}

export type ProjectFile = {
  id: string;
  project_id: string;
  kind: ProjectFileKind;
  name: string;
  size_bytes: number;
  created_at: string;
  /** A signed address for a picture (null for other files, and when the address could not be made). */
  url: string | null;
};

const COLUMNS = "id, project_id, kind, name, path, size_bytes, created_at";
type Stored = Pick<Row<"project_files">, "id" | "project_id" | "kind" | "name" | "path" | "size_bytes" | "created_at">;

/** The files as the app receives them: the storage path is replaced by a signed address (pictures only). */
export async function presentProjectFiles(db: Db, userId: string, rows: Stored[]): Promise<ProjectFile[]> {
  const pictures = rows.filter((r) => r.kind === "image" && ownsFile(userId, r.path));
  const urls = new Map<string, string>();
  if (pictures.length) {
    const { data, error } = await db.storage.from(PROJECT_FILE_BUCKET).createSignedUrls(pictures.map((r) => r.path), LIST_URL_SECONDS);
    if (error) console.error("Could not make addresses for project pictures", error);
    for (const entry of data ?? []) if (entry.signedUrl && entry.path) urls.set(entry.path, entry.signedUrl);
  }
  return rows.map(({ path, ...file }) => ({ ...file, kind: file.kind as ProjectFileKind, url: urls.get(path) ?? null }));
}

/** The files of one project, oldest first. When the database step for files has not been run yet the project simply has none. */
export async function filesOfProject(db: Db, userId: string, projectId: string): Promise<ProjectFile[]> {
  const found = await db.from("project_files").select(COLUMNS).eq("project_id", projectId).order("created_at").order("id");
  if (found.error) {
    if (found.error.code === "PGRST205" || found.error.code === "42P01") return [];
    throw dbError(found.error);
  }
  return presentProjectFiles(db, userId, found.data);
}

/** Signed addresses to look at a file and to save it under its own name, valid for a few minutes. */
export async function openProjectFile(db: Db, userId: string, file: Pick<Row<"project_files">, "path" | "name">) {
  if (!ownsFile(userId, file.path)) return null;
  const bucket = db.storage.from(PROJECT_FILE_BUCKET);
  const [view, download] = await Promise.all([bucket.createSignedUrl(file.path, OPEN_URL_SECONDS), bucket.createSignedUrl(file.path, OPEN_URL_SECONDS, { download: file.name })]);
  if (view.error || download.error || !view.data?.signedUrl || !download.data?.signedUrl) {
    console.error("Could not make an address for a project file", view.error ?? download.error);
    return null;
  }
  return { url: view.data.signedUrl, download_url: download.data.signedUrl };
}

/** Forget stored files that are no longer used. A leftover file is harmless, so a failure here is only logged. */
export async function removeProjectFiles(db: Db, userId: string, paths: (string | null | undefined)[]) {
  const own = paths.filter((path): path is string => ownsFile(userId, path));
  if (!own.length) return;
  const { error } = await db.storage.from(PROJECT_FILE_BUCKET).remove(own);
  if (error) console.error("Could not remove project files", error);
}

/** The stored paths of a project's files (read before the project is deleted, because the rows go with it). */
export async function projectFilePaths(db: Db, projectId: string): Promise<string[]> {
  const found = await db.from("project_files").select("path").eq("project_id", projectId);
  if (found.error) {
    if (found.error.code === "PGRST205" || found.error.code === "42P01") return [];
    throw dbError(found.error);
  }
  return found.data.map((row) => row.path);
}

/** Removes every project file of this person (used by "delete all my data"). Only logged when it fails. */
export async function removeAllProjectFiles(db: Db, userId: string) {
  const bucket = db.storage.from(PROJECT_FILE_BUCKET);
  for (let round = 0; round < 100; round++) {
    const { data, error } = await bucket.list(userId, { limit: 100 });
    if (error) {
      console.error("Could not list project files", error);
      return;
    }
    if (!data?.length) return;
    const removed = await bucket.remove(data.map((file) => `${userId}/${file.name}`));
    if (removed.error) {
      console.error("Could not remove project files", removed.error);
      return;
    }
  }
}

export const tooManyProjectFiles = `A project can keep up to ${PROJECT_FILES_PER_PROJECT} files. Remove one first.`;
export const projectFileTooLarge = `That file is too large. A file can be up to ${PROJECT_FILE_MAX_BYTES / (1024 * 1024)} MB.`;
