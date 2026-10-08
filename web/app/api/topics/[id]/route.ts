import { archiveItem } from "@/lib/server/archive";
import { handle, ok } from "@/lib/server/api";
import { must } from "@/lib/server/http";
import { checkPlannedWeek, TopicFields } from "@/lib/server/schemas";
import { nonEmpty, parse, s } from "@/lib/server/validate";

export const PATCH = handle<{ id: string }>(async ({ db, params, body }) => {
  const id = parse(s.id, params.id);
  const changes = nonEmpty(parse(TopicFields.omit({ unit_id: true }).partial().strict(), await body()));
  if (changes.planned_week != null) {
    // Only a week the course has: otherwise the topic would silently drop out of every week.
    const { course_id } = must(await db.from("course_topics").select("course_id").eq("id", id).single());
    checkPlannedWeek(changes.planned_week, must(await db.from("courses").select("start_date, target_date").eq("id", course_id).single()));
  }
  return must(await db.from("course_topics").update(changes).eq("id", id).select().single());
});

export const DELETE = handle<{ id: string }>(async ({ db, params }) => {
  const id = parse(s.id, params.id);
  await archiveItem(db, "topic", id);
  return ok;
});
