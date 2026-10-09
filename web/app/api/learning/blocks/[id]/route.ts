import { archiveItem } from "@/lib/server/archive";
import { handle, ok } from "@/lib/server/api";
import { must } from "@/lib/server/http";
import { BlockCreate } from "@/lib/server/schemas";
import { checkBlockLinks } from "@/lib/server/study";
import { nonEmpty, parse, s } from "@/lib/server/validate";

export const PATCH = handle<{ id: string }>(async ({ db, params, body }) => {
  const id = parse(s.id, params.id);
  const changes = nonEmpty(parse(BlockCreate.omit({ week_start: true }).partial().strict(), await body()));
  await checkBlockLinks(db, changes);
  // Taking the topic off a session (topic_id: null) also forgets which topic it was about.
  const update = changes.topic_id === null ? { ...changes, topic_ref: null } : changes;
  return must(await db.from("study_blocks").update(update).eq("id", id).select().single());
});

export const DELETE = handle<{ id: string }>(async ({ db, params }) => {
  const id = parse(s.id, params.id);
  await archiveItem(db, "study_block", id);
  return ok;
});
