import { handle } from "@/lib/server/api";
import { withProgress } from "@/lib/server/goals";
import { must } from "@/lib/server/http";
import { GoalCreate } from "@/lib/server/schemas";
import { parse } from "@/lib/server/validate";

export const GET = handle(async ({ db, today }) => {
  const rows = must(await db.from("goals").select("*, goal_milestones(*)").order("deadline", { nullsFirst: false }).order("created_at"));
  const items = rows.map(withProgress);
  const active = items.filter((g) => g.status !== "completed");
  return {
    today: await today(),
    items,
    summary: {
      active: active.length,
      on_track: active.filter((g) => g.status === "on-track").length,
      behind: active.filter((g) => g.status === "behind").length,
      average: active.length ? Math.round(active.reduce((sum, g) => sum + g.percent, 0) / active.length) : 0,
    },
  };
});

export const POST = handle(async ({ db, body }) => {
  const input = parse(GoalCreate, await body());
  const goal = must(await db.from("goals").insert(input).select("*, goal_milestones(*)").single());
  return withProgress(goal);
}, { status: 201 });
