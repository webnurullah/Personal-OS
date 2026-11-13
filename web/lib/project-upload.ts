// Projects: what the browser does with a chosen file before it is sent. A picture that fits is sent as it is (a logo keeps its
// see-through background); a bigger picture is shrunk to a JPEG; a PDF or any other file is sent as it is when it is small enough.
import { prepareJobImage, PictureError } from "./job-image.ts";
import { displayName, fileSizeText } from "./note-files.ts";
import { PROJECT_FILE_MAX_BYTES } from "./project-files.ts";

const KEEP_AS_IS = ["image/jpeg", "image/png", "image/webp"];

const tooBig = (file: File) =>
  new PictureError(`“${file.name}” is ${fileSizeText(file.size)}. A file can be up to ${fileSizeText(PROJECT_FILE_MAX_BYTES)}. Make it smaller (for example, compress it or save it again with “reduce file size”) and add it again.`);

/** What the screen sends for a chosen file. Throws a PictureError with a message that is fine to show. */
export async function prepareProjectFile(file: File): Promise<{ blob: Blob; name: string }> {
  if (!file.size) throw new PictureError(`“${file.name}” is empty.`);
  const name = file.name.replace(/[\\/\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim() || "File";
  // A picture the app can show, small enough: the original, untouched.
  if (KEEP_AS_IS.includes(file.type) && file.size <= PROJECT_FILE_MAX_BYTES) return { blob: file, name };
  // A bigger picture: made smaller (a JPEG). Other picture kinds (GIF, SVG, HEIC …) are kept as files, to be downloaded.
  if (KEEP_AS_IS.includes(file.type)) return { blob: await prepareJobImage(file), name: displayName(name, "image") };
  if (file.size > PROJECT_FILE_MAX_BYTES) throw tooBig(file);
  return { blob: file.type ? file : new Blob([file], { type: "application/octet-stream" }), name };
}

export { PictureError };
