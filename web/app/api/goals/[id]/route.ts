import { archiveItem } from "@/lib/server/archive";
import { handle, ok } from "@/lib/server/api";
import { linkGoals, withProgress } from "@/lib/server/goals";
import { must } from "@/lib/server/http";
import { checkGoalLink, GoalCreate } from "@/lib/server/schemas";
import type { Row } from "@/lib/server/supabase";
import { nonEmpty, parse, s } from "@/lib/server/validate";

export const PATCH = handle<{ id: string }>(async ({ db, params, body, today }) => {
  const id = parse(s.id, params.id);
  const changes: Partial<Row<"goals">> = checkGoalLink(nonEmpty(parse(GoalCreate.partial().strict(), await body())));
  if (changes.course_id) must(await db.from("courses").select("id").eq("id", changes.course_id).single()); // the course must be yours
  if (changes.status) changes.completed_on = changes.status === "completed" ? await today() : null;
  const goal = must(await db.from("goals").update(changes).eq("id", id).select("*, goal_milestones(*)").single());
  return withProgress((await linkGoals(db, [goal]))[0]);
});

export const DELETE = handle<{ id: string }>(async ({ db, params }) => {
  const id = parse(s.id, params.id);
  await archiveItem(db, "goal", id);
  return ok;
});
