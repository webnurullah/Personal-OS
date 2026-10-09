import { handle } from "@/lib/server/api";
import { linkGoals, withProgress } from "@/lib/server/goals";
import { must } from "@/lib/server/http";
import { checkGoalLink, GoalCreate } from "@/lib/server/schemas";
import { parse } from "@/lib/server/validate";

export const GET = handle(async ({ db, today }) => {
  const rows = must(await db.from("goals").select("*, goal_milestones(*)").order("deadline", { nullsFirst: false }).order("created_at"));
  const items = (await linkGoals(db, rows)).map(withProgress);
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
  const input = checkGoalLink(parse(GoalCreate, await body()));
  if (input.course_id) must(await db.from("courses").select("id").eq("id", input.course_id).single()); // the course must be yours
  const goal = must(await db.from("goals").insert(input).select("*, goal_milestones(*)").single());
  return withProgress((await linkGoals(db, [goal]))[0]);
}, { status: 201 });
