import { handle, ok } from "@/lib/server/api";
import { must } from "@/lib/server/http";
import { parse, s } from "@/lib/server/validate";

// Delete an Archive entry for good. This is the one place where data is really deleted
// (an archived project is deleted through /api/projects/:id).
export const DELETE = handle<{ id: string }>(async ({ db, params }) => {
  const id = parse(s.id, params.id);
  must(await db.from("archive_items").delete().eq("id", id).select("id").single());
  return ok;
});
