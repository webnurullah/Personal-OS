import { handle, ok } from "@/lib/server/api";
import { must } from "@/lib/server/http";
import { removeJobImages } from "@/lib/server/job-image";
import { parse, s } from "@/lib/server/validate";

// Delete an Archive entry for good. This is the one place where data is really deleted
// (an archived project is deleted through /api/projects/:id).
export const DELETE = handle<{ id: string }>(async ({ db, user, params }) => {
  const id = parse(s.id, params.id);
  // A job keeps its picture while it waits in the Archive; the file goes with the entry.
  const entry = must(await db.from("archive_items").select("kind, data").eq("id", id).single());
  must(await db.from("archive_items").delete().eq("id", id).select("id").single());
  const row = (entry.data as { row?: { image_path?: unknown } } | null)?.row;
  if (entry.kind === "job" && typeof row?.image_path === "string") await removeJobImages(db, user.id, [row.image_path]);
  return ok;
});
