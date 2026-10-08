import { handle } from "@/lib/server/api";
import { nextPosition } from "@/lib/course";
import { must } from "@/lib/server/http";
import { checkPlannedWeek, TopicFields } from "@/lib/server/schemas";
import { parse, s } from "@/lib/server/validate";

export const POST = handle<{ id: string }>(async ({ db, params, body }) => {
  const courseId = parse(s.id, params.id);
  const input = parse(TopicFields, await body());
  // The unit must belong to this course (and to you).
  must(await db.from("course_units").select("id").eq("id", input.unit_id).eq("course_id", courseId).single());
  checkPlannedWeek(input.planned_week, must(await db.from("courses").select("start_date, target_date").eq("id", courseId).single()));
  if (input.position === undefined) {
    // After the last topic, even when topics were deleted in between (counting them would hand out a position twice).
    const last = must(await db.from("course_topics").select("position").eq("course_id", courseId).order("position", { ascending: false }).limit(1));
    input.position = nextPosition(last.map((t) => t.position));
  }
  return must(await db.from("course_topics").insert({ ...input, course_id: courseId }).select().single());
}, { status: 201 });
