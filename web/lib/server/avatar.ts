// Profile photo helpers: what a picture file looks like, where it is stored and its public address.
import type { Db } from "./supabase.ts";

export const AVATAR_BUCKET = "avatars";
/** The app sends about 20 KB; the bucket itself refuses anything above this too. */
export const AVATAR_MAX_BYTES = 512 * 1024;

export type ImageKind = { type: "image/jpeg" | "image/png" | "image/webp"; ext: "jpg" | "png" | "webp" };

const startsWith = (bytes: Uint8Array, at: number, signature: number[]) => signature.every((byte, i) => bytes[at + i] === byte);

/** Tells the picture type from the first bytes of the file (never from the name or the header the browser sent). */
export function sniffImage(bytes: Uint8Array): ImageKind | null {
  if (startsWith(bytes, 0, [0xff, 0xd8, 0xff])) return { type: "image/jpeg", ext: "jpg" };
  if (startsWith(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { type: "image/png", ext: "png" };
  // WebP: "RIFF" + 4 size bytes + "WEBP"
  if (startsWith(bytes, 0, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, 8, [0x57, 0x45, 0x42, 0x50])) return { type: "image/webp", ext: "webp" };
  return null;
}

/** A new file name for every upload, inside the person's own folder, so a changed photo is never served from an old cache. */
export function avatarPath(userId: string, ext: ImageKind["ext"], id: string) {
  return `${userId}/${id}.${ext}`;
}

/** True when the path is inside this person's own folder. */
export function ownsAvatar(userId: string, path: string | null | undefined): path is string {
  return Boolean(path) && path!.startsWith(`${userId}/`) && !path!.includes("..");
}

/** The public address of a person's photo, or null. */
export function avatarUrl(db: Db, userId: string, path: string | null | undefined) {
  return ownsAvatar(userId, path) ? db.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl : null;
}
