import { handle } from "@/lib/server/api";
import { addOutline, planCourse } from "@/lib/server/course-planning";
import { OutlineInput } from "@/lib/server/schemas";
import { parse, s } from "@/lib/server/validate";

// Adds a pasted outline (units and topics) to the course, and gives the new topics their weeks when asked.
export const POST = handle<{ id: string }>(async ({ db, params, body, today, profile }) => {
  const id = parse(s.id, params.id);
  const input = parse(OutlineInput, await body());
  const added = await addOutline(db, id, input.text, input.default_hours);
  const plan = input.plan ? await planCourse(db, id, "plan", input.weekly_hours ?? Number((await profile()).weekly_study_goal), await today()) : null;
  return { ...added, plan };
}, { status: 201 });
