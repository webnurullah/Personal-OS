import { handle } from "@/lib/server/api";
import { must } from "@/lib/server/http";
import { UnitFields } from "@/lib/server/schemas";
import { parse, s } from "@/lib/server/validate";

export const POST = handle<{ id: string }>(async ({ db, params, body }) => {
  const courseId = parse(s.id, params.id);
  const input = parse(UnitFields, await body());
  must(await db.from("courses").select("id").eq("id", courseId).single()); // the course must be yours
  if (input.position === undefined) {
    const { count } = await db.from("course_units").select("id", { count: "exact", head: true }).eq("course_id", courseId);
    input.position = count ?? 0;
  }
  return must(await db.from("course_units").insert({ ...input, course_id: courseId }).select().single());
}, { status: 201 });
