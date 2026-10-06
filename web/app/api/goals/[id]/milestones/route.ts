import { handle } from "@/lib/server/api";
import { must } from "@/lib/server/http";
import { MilestoneCreate } from "@/lib/server/schemas";
import { parse, s } from "@/lib/server/validate";

export const POST = handle<{ id: string }>(async ({ db, params, body }) => {
  const goalId = parse(s.id, params.id);
  const input = parse(MilestoneCreate, await body());
  must(await db.from("goals").select("id").eq("id", goalId).single()); // the goal must be yours
  if (input.position === undefined) {
    const { count } = await db.from("goal_milestones").select("id", { count: "exact", head: true }).eq("goal_id", goalId);
    input.position = count ?? 0;
  }
  return must(await db.from("goal_milestones").insert({ ...input, goal_id: goalId }).select().single());
}, { status: 201 });
