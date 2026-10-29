// Notes: pictures and PDFs kept with a note. Shared by the screen and the server (plain functions, tested).
// What the browser does with a chosen file before sending it is in note-upload.ts.
/** One file may have up to this many bytes (Vercel accepts request bodies up to 4.5 MB; the bucket refuses more than this too). */
export const NOTE_FILE_MAX_BYTES = 4 * 1024 * 1024;
/** A note keeps up to this many files. */
export const NOTE_FILES_PER_NOTE = 10;

/** "850 KB", "2.4 MB". */
export function fileSizeText(bytes: number) {
  if (bytes < 1024) return `${Math.max(0, Math.round(bytes))} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? Math.round(mb * 10) / 10 : Math.round(mb)} MB`;
}

/** Whether a chosen file is a PDF (by its type, or by its name when the browser did not tell). */
export const isPdfFile = (file: { name: string; type: string }) => file.type === "application/pdf" || (!file.type && /\.pdf$/i.test(file.name));

/** A short name for a staged file ("Photo.jpg" stays, "IMG_0001.HEIC" becomes "IMG_0001.jpg" once it is a JPEG). */
export function displayName(name: string, kind: "image" | "pdf") {
  const clean = name.replace(/[\\/\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim();
  const base = (kind === "image" ? clean.replace(/\.[A-Za-z0-9]{1,5}$/, "") : clean.replace(/\.pdf$/i, "")).replace(/^[.\s]+/, "");
  const stem = (base || (kind === "image" ? "Picture" : "Document")).slice(0, 190);
  return `${stem}.${kind === "image" ? "jpg" : "pdf"}`;
}
