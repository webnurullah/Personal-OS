// Projects: files kept with a project. Shared by the screen and the server (plain functions, tested).
// What the browser does with a chosen file before sending it is in project-upload.ts.
import { NOTE_FILE_MAX_BYTES } from "./note-files.ts";

/** One file may have up to this many bytes (the same as in notes: Vercel accepts request bodies up to 4.5 MB). */
export const PROJECT_FILE_MAX_BYTES = NOTE_FILE_MAX_BYTES;
/** A project keeps up to this many files. */
export const PROJECT_FILES_PER_PROJECT = 20;

/** The ending of a file name in capitals for a small label ("DOCX"), or "" when it has none. */
export function fileEnding(name: string) {
  const ending = /\.([A-Za-z0-9]{1,10})$/.exec(name.trim())?.[1];
  return ending ? ending.toUpperCase() : "";
}

/** What kind of thing a file is, in words: "PDF", "Picture", "DOCX file", "File". */
export function fileKindLabel(kind: "image" | "pdf" | "file", name: string) {
  if (kind === "pdf") return "PDF";
  if (kind === "image") return "Picture";
  const ending = fileEnding(name);
  return ending ? `${ending} file` : "File";
}
