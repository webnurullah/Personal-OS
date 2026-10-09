import { handle } from "@/lib/server/api";
import { planCourse } from "@/lib/server/course-planning";
import { PlanInput } from "@/lib/server/schemas";
import { parse, s } from "@/lib/server/validate";

// Plans the weeks: "plan" spreads the unfinished topics from this week over your weekly hours, "carry" moves late topics to this week.
export const POST = handle<{ id: string }>(async ({ db, params, body, today, profile }) => {
  const id = parse(s.id, params.id);
  const input = parse(PlanInput, await body());
  return planCourse(db, id, input.mode, input.weekly_hours ?? Number((await profile()).weekly_study_goal), await today());
});
