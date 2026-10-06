import { forgetProfile, handle, type Ctx } from "@/lib/server/api";
import { AVATAR_BUCKET, AVATAR_MAX_BYTES, avatarPath, ownsAvatar, sniffImage } from "@/lib/server/avatar";
import { HttpError, must } from "@/lib/server/http";
import { presentProfile } from "@/lib/server/profile";

/** Forget a picture file that is no longer used. A leftover file is harmless, so a failure here is not an error. */
async function removeFile(ctx: Ctx<object>, path: string | null | undefined) {
  if (!ownsAvatar(ctx.user.id, path)) return;
  const { error } = await ctx.db.storage.from(AVATAR_BUCKET).remove([path]);
  if (error) console.error("Could not remove an old profile photo", error);
}

/** The photo path saved right now (read fresh, so two open tabs cannot leave a forgotten file behind). */
async function currentPath(ctx: Ctx<object>) {
  return must(await ctx.db.from("profiles").select("avatar_path").eq("id", ctx.user.id).single()).avatar_path;
}

/**
 * Replaces the profile photo. The body is the picture itself (the app sends a small square JPEG), not JSON.
 * The file type is read from the file's own first bytes, the picture is stored in the person's own folder under
 * a new random name, and only then does the profile point to it; the old file is removed last.
 */
export const POST = handle(async (ctx) => {
  const declared = Number(ctx.req.headers.get("content-length") ?? 0);
  if (declared > AVATAR_MAX_BYTES) throw new HttpError(413, "That picture is too large. Choose a smaller one.");
  const bytes = new Uint8Array(await ctx.req.arrayBuffer());
  if (!bytes.length) throw new HttpError(400, "Choose a picture first.");
  if (bytes.length > AVATAR_MAX_BYTES) throw new HttpError(413, "That picture is too large. Choose a smaller one.");
  const kind = sniffImage(bytes);
  if (!kind) throw new HttpError(400, "That file is not a JPG, PNG or WebP picture.");

  const before = await currentPath(ctx);
  const path = avatarPath(ctx.user.id, kind.ext, crypto.randomUUID());
  const stored = await ctx.db.storage.from(AVATAR_BUCKET).upload(path, bytes, { contentType: kind.type, cacheControl: "31536000", upsert: false });
  if (stored.error) {
    console.error("Profile photo upload failed", stored.error);
    throw new HttpError(502, "The picture could not be saved. Please try again.", stored.error.message);
  }

  let profile;
  try {
    profile = must(await ctx.db.from("profiles").update({ avatar_path: path }).eq("id", ctx.user.id).select().single());
  } catch (error) {
    await removeFile(ctx, path);
    throw error;
  }
  forgetProfile(ctx.user.id);
  if (before !== path) await removeFile(ctx, before);
  return presentProfile(ctx, profile);
});

/** Removes the profile photo (the little drawing is shown again). */
export const DELETE = handle(async (ctx) => {
  const before = await currentPath(ctx);
  const profile = must(await ctx.db.from("profiles").update({ avatar_path: null }).eq("id", ctx.user.id).select().single());
  forgetProfile(ctx.user.id);
  await removeFile(ctx, before);
  return presentProfile(ctx, profile);
});
