import { handle, ok } from "@/lib/server/api";
import { withProgress } from "@/lib/server/goals";
import { must } from "@/lib/server/http";
import { GoalCreate } from "@/lib/server/schemas";
import type { Row } from "@/lib/server/supabase";
import { nonEmpty, parse, s } from "@/lib/server/validate";

export const PATCH = handle<{ id: string }>(async ({ db, params, body, today }) => {
  const id = parse(s.id, params.id);
  const changes: Partial<Row<"goals">> = nonEmpty(parse(GoalCreate.partial().strict(), await body()));
  if (changes.status) changes.completed_on = changes.status === "completed" ? await today() : null;
  const goal = must(await db.from("goals").update(changes).eq("id", id).select("*, goal_milestones(*)").single());
  return withProgress(goal);
});

export const DELETE = handle<{ id: string }>(async ({ db, params }) => {
  const id = parse(s.id, params.id);
  must(await db.from("goals").delete().eq("id", id).select("id").single());
  return ok;
});
