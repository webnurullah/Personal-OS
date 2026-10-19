import { archiveItem } from "@/lib/server/archive";
import { handle, ok } from "@/lib/server/api";
import { saveHabitSources } from "@/lib/server/habit-time";
import { must } from "@/lib/server/http";
import { HabitUpdate } from "@/lib/server/schemas";
import type { Row } from "@/lib/server/supabase";
import { nonEmpty, parse, s } from "@/lib/server/validate";

export const PATCH = handle<{ id: string }>(async ({ db, params, body }) => {
  const id = parse(s.id, params.id);
  const { archived, sources, ...rest } = nonEmpty(parse(HabitUpdate, await body()));
  const changes: Partial<Row<"habits">> = { ...rest };
  if (archived !== undefined) changes.archived_at = archived ? new Date().toISOString() : null;
  // A changed goal can be reached again today: it may tick the day again.
  if (rest.target_minutes !== undefined) changes.auto_checked_on = null;
  const saved = Object.keys(changes).length ? must(await db.from("habits").update(changes).eq("id", id).select().single()) : must(await db.from("habits").select("*").eq("id", id).single());
  if (sources) await saveHabitSources(db, id, sources);
  return saved;
});

export const DELETE = handle<{ id: string }>(async ({ db, params }) => {
  const id = parse(s.id, params.id);
  await archiveItem(db, "habit", id);
  return ok;
});
