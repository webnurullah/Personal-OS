// Job Apply: the picture saved with a job (a screenshot of the post or circular). Stored like the profile photo:
// public bucket, one folder per person, a new random file name for every upload; the job only remembers the path.
import type { Db, Row } from "./supabase.ts";
import { avatarPath as imagePath, ownsAvatar as ownsImage } from "./avatar.ts";

export const JOB_IMAGE_BUCKET = "job-images";
/** The app sends a JPEG of 200-800 KB; the bucket refuses more than 3 MB too. (Vercel accepts bodies up to 4.5 MB.) */
export const JOB_IMAGE_MAX_BYTES = 3 * 1024 * 1024;

export { imagePath, ownsImage };

/** The public address of a job's picture, or null. */
export function jobImageUrl(db: Db, userId: string, path: string | null | undefined) {
  return ownsImage(userId, path) ? db.storage.from(JOB_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl : null;
}

/** A saved job as the app receives it: the picture's address instead of its storage path. */
export function presentJob(db: Db, userId: string, job: Row<"job_applications">) {
  const { image_path, ...rest } = job;
  return { ...rest, image_url: jobImageUrl(db, userId, image_path) };
}

/** Forget picture files that are no longer used. A leftover file is harmless, so a failure here is only logged. */
export async function removeJobImages(db: Db, userId: string, paths: (string | null | undefined)[]) {
  const own = paths.filter((path): path is string => ownsImage(userId, path));
  if (!own.length) return;
  const { error } = await db.storage.from(JOB_IMAGE_BUCKET).remove(own);
  if (error) console.error("Could not remove old job pictures", error);
}

/** Removes every job picture of this person (used by "delete all my data"). Only logged when it fails. */
export async function removeAllJobImages(db: Db, userId: string) {
  const bucket = db.storage.from(JOB_IMAGE_BUCKET);
  for (let round = 0; round < 20; round++) {
    const { data, error } = await bucket.list(userId, { limit: 100 });
    if (error) {
      console.error("Could not list job pictures", error);
      return;
    }
    if (!data?.length) return;
    const removed = await bucket.remove(data.map((file) => `${userId}/${file.name}`));
    if (removed.error) {
      console.error("Could not remove job pictures", removed.error);
      return;
    }
  }
}
