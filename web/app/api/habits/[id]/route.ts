import { handle, ok } from "@/lib/server/api";
import { must } from "@/lib/server/http";
import { HabitUpdate } from "@/lib/server/schemas";
import type { Row } from "@/lib/server/supabase";
import { nonEmpty, parse, s } from "@/lib/server/validate";

export const PATCH = handle<{ id: string }>(async ({ db, params, body }) => {
  const id = parse(s.id, params.id);
  const { archived, ...rest } = nonEmpty(parse(HabitUpdate, await body()));
  const changes: Partial<Row<"habits">> = { ...rest };
  if (archived !== undefined) changes.archived_at = archived ? new Date().toISOString() : null;
  return must(await db.from("habits").update(changes).eq("id", id).select().single());
});

export const DELETE = handle<{ id: string }>(async ({ db, params }) => {
  const id = parse(s.id, params.id);
  must(await db.from("habits").delete().eq("id", id).select("id").single());
  return ok;
});
