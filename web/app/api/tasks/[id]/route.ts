import { archiveItem } from "@/lib/server/archive";
import { handle, ok } from "@/lib/server/api";
import { must } from "@/lib/server/http";
import { checkTaskDates, TaskUpdate } from "@/lib/server/schemas";
import type { Row } from "@/lib/server/supabase";
import { nonEmpty, parse, s } from "@/lib/server/validate";

export const PATCH = handle<{ id: string }>(async ({ db, params, body }) => {
  const id = parse(s.id, params.id);
  const { done, ...rest } = checkTaskDates(nonEmpty(parse(TaskUpdate, await body())));
  const changes: Partial<Row<"tasks">> = { ...rest };
  if (done !== undefined) changes.done_at = done ? new Date().toISOString() : null;
  return must(await db.from("tasks").update(changes).eq("id", id).select().single());
});

export const DELETE = handle<{ id: string }>(async ({ db, params }) => {
  const id = parse(s.id, params.id);
  await archiveItem(db, "task", id);
  return ok;
});
