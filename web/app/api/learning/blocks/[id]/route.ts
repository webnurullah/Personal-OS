import { handle, ok } from "@/lib/server/api";
import { must } from "@/lib/server/http";
import { BlockCreate } from "@/lib/server/schemas";
import { nonEmpty, parse, s } from "@/lib/server/validate";

export const PATCH = handle<{ id: string }>(async ({ db, params, body }) => {
  const id = parse(s.id, params.id);
  const changes = nonEmpty(parse(BlockCreate.omit({ week_start: true }).partial().strict(), await body()));
  return must(await db.from("study_blocks").update(changes).eq("id", id).select().single());
});

export const DELETE = handle<{ id: string }>(async ({ db, params }) => {
  const id = parse(s.id, params.id);
  must(await db.from("study_blocks").delete().eq("id", id).select("id").single());
  return ok;
});
