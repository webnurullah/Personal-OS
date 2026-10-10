// Job Apply: the picture saved with a job. The chosen photo or screenshot is opened in the browser, shrunk so its
// longest side is at most 2000 pixels (text in a circular stays readable) and sent as a JPEG of a few hundred KB.
import { loadPicture, PictureError } from "./avatar-image.ts";

export const JOB_IMAGE_SIDE = 2000;
/** The server and the bucket accept 3 MB; this keeps a margin under it. */
export const JOB_IMAGE_BYTES = 2.5 * 1024 * 1024;
/** The quality steps tried, best first, until the picture fits. */
export const JOB_IMAGE_QUALITIES = [0.86, 0.72, 0.58, 0.45];

/** The JPEG to upload for a chosen file. Throws a PictureError with a message that is fine to show. */
export async function prepareJobImage(file: File): Promise<Blob> {
  const { canvas } = await loadPicture(file, JOB_IMAGE_SIDE);
  for (const quality of JOB_IMAGE_QUALITIES) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) throw new PictureError("This browser could not prepare the picture.");
    if (blob.size <= JOB_IMAGE_BYTES) return blob;
  }
  throw new PictureError("That picture is too detailed to save. Try a smaller screenshot.");
}

export { PictureError };
