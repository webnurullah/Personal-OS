// Job Apply: the picture saved with a job. The chosen photo or screenshot is opened in the browser, shrunk when it is very big
// (at most about 8 million pixels, and 16000 on a side, so the text in a long screenshot stays readable) and sent as
// a JPEG of a few hundred KB to 2.5 MB.
import { loadPicture, PictureError } from "./avatar-image.ts";

/** The longest side, in pixels. */
export const JOB_IMAGE_SIDE = 16000;
/** How many pixels a picture may have, best first. A picture that does not fit in the byte limit at the lowest quality is tried again smaller. */
export const JOB_IMAGE_PIXELS = [8_000_000, 4_000_000, 2_000_000];
/** The server and the bucket accept 3 MB; this keeps a margin under it. */
export const JOB_IMAGE_BYTES = 2.5 * 1024 * 1024;
/** The quality steps tried, best first, until the picture fits. */
export const JOB_IMAGE_QUALITIES = [0.86, 0.72, 0.58, 0.45];

/** The JPEG to upload for a chosen file. Throws a PictureError with a message that is fine to show. */
export async function prepareJobImage(file: File): Promise<Blob> {
  for (const pixels of JOB_IMAGE_PIXELS) {
    const { canvas } = await loadPicture(file, JOB_IMAGE_SIDE, pixels);
    for (const quality of JOB_IMAGE_QUALITIES) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (!blob) throw new PictureError("This browser could not prepare the picture.");
      if (blob.size <= JOB_IMAGE_BYTES) return blob;
    }
  }
  throw new PictureError("That picture is too detailed to save. Try a smaller screenshot.");
}

export { PictureError };
