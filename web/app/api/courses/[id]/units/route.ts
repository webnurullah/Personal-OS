import { handle } from "@/lib/server/api";
import { nextPosition } from "@/lib/course";
import { must } from "@/lib/server/http";
import { UnitFields } from "@/lib/server/schemas";
import { parse, s } from "@/lib/server/validate";

export const POST = handle<{ id: string }>(async ({ db, params, body }) => {
  const courseId = parse(s.id, params.id);
  const input = parse(UnitFields, await body());
  must(await db.from("courses").select("id").eq("id", courseId).single()); // the course must be yours
  if (input.position === undefined) {
    // After the last unit, even when units were deleted in between (counting them would hand out a position twice).
    const last = must(await db.from("course_units").select("position").eq("course_id", courseId).order("position", { ascending: false }).limit(1));
    input.position = nextPosition(last.map((u) => u.position));
  }
  return must(await db.from("course_units").insert({ ...input, course_id: courseId }).select().single());
}, { status: 201 });
