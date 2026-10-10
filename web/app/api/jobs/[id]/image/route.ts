import { handle } from "@/lib/server/api";
import { sniffImage } from "@/lib/server/avatar";
import { HttpError, must } from "@/lib/server/http";
import { imagePath, JOB_IMAGE_BUCKET, JOB_IMAGE_MAX_BYTES, presentJob, removeJobImages, sameImage } from "@/lib/server/job-image";
import { parse, s } from "@/lib/server/validate";

const TOO_LARGE = "That picture is too large. Choose a smaller one.";
const CHANGED = "This job's picture was changed somewhere else. Reload the page and try again.";

/**
 * Saves a picture with a job (replacing the old one). The body is the picture itself (the app sends a JPEG
 * made from your photo), not JSON. The file type is read from the file's own first bytes, the picture is
 * stored in your own folder under a new random name, and only then does the job point to it; the old file is
 * removed last.
 */
export const POST = handle<{ id: string }>(async ({ db, user, params, req }) => {
  const id = parse(s.id, params.id);
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > JOB_IMAGE_MAX_BYTES) throw new HttpError(413, TOO_LARGE);
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (!bytes.length) throw new HttpError(400, "Choose a picture first.");
  if (bytes.length > JOB_IMAGE_MAX_BYTES) throw new HttpError(413, TOO_LARGE);
  const kind = sniffImage(bytes);
  if (!kind) throw new HttpError(400, "That file is not a JPG, PNG or WebP picture.");

  // Read fresh (and check the job is yours: another person's job is simply not found).
  const before = must(await db.from("job_applications").select("image_path").eq("id", id).single()).image_path;
  const path = imagePath(user.id, kind.ext, crypto.randomUUID());
  const stored = await db.storage.from(JOB_IMAGE_BUCKET).upload(path, bytes, { contentType: kind.type, cacheControl: "31536000", upsert: false });
  if (stored.error) {
    console.error("Job picture upload failed", stored.error);
    throw new HttpError(502, "The picture could not be saved. Please try again.", stored.error.message);
  }

  // Only if the job still has the picture read above: a second tab that changed it meanwhile wins, and this upload is undone
  // (otherwise the file that is replaced first would be left behind in the bucket with nothing pointing at it).
  let job;
  try {
    job = must(await sameImage(db.from("job_applications").update({ image_path: path }).eq("id", id), before).select().maybeSingle());
  } catch (error) {
    await removeJobImages(db, user.id, [path]);
    throw error;
  }
  if (!job) {
    await removeJobImages(db, user.id, [path]);
    throw new HttpError(409, CHANGED);
  }
  await removeJobImages(db, user.id, [before]);
  return presentJob(db, user.id, job);
});

/** Takes the picture off a job (and deletes the file). */
export const DELETE = handle<{ id: string }>(async ({ db, user, params }) => {
  const id = parse(s.id, params.id);
  const current = must(await db.from("job_applications").select("*").eq("id", id).single());
  if (!current.image_path) return presentJob(db, user.id, current);
  const job = must(await sameImage(db.from("job_applications").update({ image_path: null }).eq("id", id), current.image_path).select().maybeSingle());
  if (!job) throw new HttpError(409, CHANGED);
  await removeJobImages(db, user.id, [current.image_path]);
  return presentJob(db, user.id, job);
});
