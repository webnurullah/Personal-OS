import { handle } from "@/lib/server/api";
import { must } from "@/lib/server/http";
import { TopicFields } from "@/lib/server/schemas";
import { parse, s } from "@/lib/server/validate";

export const POST = handle<{ id: string }>(async ({ db, params, body }) => {
  const courseId = parse(s.id, params.id);
  const input = parse(TopicFields, await body());
  // The unit must belong to this course (and to you).
  must(await db.from("course_units").select("id").eq("id", input.unit_id).eq("course_id", courseId).single());
  if (input.position === undefined) {
    const { count } = await db.from("course_topics").select("id", { count: "exact", head: true }).eq("course_id", courseId);
    input.position = count ?? 0;
  }
  return must(await db.from("course_topics").insert({ ...input, course_id: courseId }).select().single());
}, { status: 201 });
