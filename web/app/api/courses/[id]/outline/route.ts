import { handle } from "@/lib/server/api";
import { addOutline, planCourse, type PlanResult } from "@/lib/server/course-planning";
import { HttpError } from "@/lib/server/http";
import { OutlineInput } from "@/lib/server/schemas";
import { parse, s } from "@/lib/server/validate";

// Adds a pasted outline (units and topics) to the course, and gives the new topics their weeks when asked.
// The outline is added first and stays added: if only the planning fails, the answer says so (adding it again would add every unit twice).
export const POST = handle<{ id: string }>(async ({ db, params, body, today, profile }) => {
  const id = parse(s.id, params.id);
  const input = parse(OutlineInput, await body());
  const added = await addOutline(db, id, input.text, input.default_hours);
  let plan: PlanResult | null = null;
  let plan_error: string | null = null;
  if (input.plan) {
    try {
      plan = await planCourse(db, id, "plan", input.weekly_hours ?? Number((await profile()).weekly_study_goal), await today());
    } catch (error) {
      plan_error = error instanceof HttpError ? error.message : "The weeks could not be planned.";
    }
  }
  return { ...added, plan, plan_error };
}, { status: 201 });
