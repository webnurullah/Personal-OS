import { handle, ok } from "@/lib/server/api";
import { must } from "@/lib/server/http";
import { checkDates, CourseFields } from "@/lib/server/schemas";
import { nonEmpty, parse, s } from "@/lib/server/validate";

// One course with its units and topics. The web app works out the totals,
// so they update instantly while you type.
export const GET = handle<{ id: string }>(async ({ db, params, today }) => {
  const id = parse(s.id, params.id);
  const course = must(await db.from("courses").select("*").eq("id", id).single());
  const [unitRows, topicRows] = await Promise.all([
    db.from("course_units").select("*").eq("course_id", id).order("position").order("code"),
    db.from("course_topics").select("*").eq("course_id", id).order("position").order("code"),
  ]);
  const topics = must(topicRows);
  return {
    today: await today(),
    course,
    units: must(unitRows).map((unit) => ({ ...unit, topics: topics.filter((t) => t.unit_id === unit.id) })),
  };
});

export const PATCH = handle<{ id: string }>(async ({ db, params, body }) => {
  const id = parse(s.id, params.id);
  const changes = checkDates(nonEmpty(parse(CourseFields.partial().strict(), await body())));
  return must(await db.from("courses").update(changes).eq("id", id).select().single());
});

// Deletes its units and topics too.
export const DELETE = handle<{ id: string }>(async ({ db, params }) => {
  const id = parse(s.id, params.id);
  must(await db.from("courses").delete().eq("id", id).select("id").single());
  return ok;
});
