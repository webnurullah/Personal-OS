import { handle } from "@/lib/server/api";
import { must } from "@/lib/server/http";
import { parse, s } from "@/lib/server/validate";

// Puts an Archive entry back where it came from, with what was deleted along with it.
// Answers { kind, id, title }. A clear message comes back when something it needs is gone (say, the goal of a milestone).
export const POST = handle<{ id: string }>(async ({ db, params }) => {
  const id = parse(s.id, params.id);
  return must(await db.rpc("archive_restore", { p_id: id }));
});
