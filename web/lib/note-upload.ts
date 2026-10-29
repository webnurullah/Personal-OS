// Notes: what the browser does with a chosen file before it is sent (a PDF goes as it is, a picture is shrunk to a JPEG).
import { prepareJobImage, PictureError } from "./job-image.ts";
import { displayName, fileSizeText, isPdfFile, NOTE_FILE_MAX_BYTES } from "./note-files.ts";

/** What the screen sends for a chosen file. Throws a PictureError with a message that is fine to show. */
export async function prepareNoteFile(file: File): Promise<{ kind: "image" | "pdf"; blob: Blob; name: string }> {
  if (isPdfFile(file)) {
    if (!file.size) throw new PictureError(`“${file.name}” is empty.`);
    if (file.size > NOTE_FILE_MAX_BYTES) {
      throw new PictureError(`“${file.name}” is ${fileSizeText(file.size)}. A PDF can be up to ${fileSizeText(NOTE_FILE_MAX_BYTES)}. Make it smaller (for example, save it again with “reduce file size”) and add it again.`);
    }
    return { kind: "pdf", blob: file.type === "application/pdf" ? file : new Blob([file], { type: "application/pdf" }), name: displayName(file.name, "pdf") };
  }
  if (file.type && !file.type.startsWith("image/")) throw new PictureError("Only pictures (JPG, PNG or WebP) and PDFs can be added.");
  return { kind: "image", blob: await prepareJobImage(file), name: displayName(file.name, "image") };
}

export { PictureError };
