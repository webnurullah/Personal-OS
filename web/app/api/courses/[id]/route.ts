import { archiveItem } from "@/lib/server/archive";
import { handle, ok } from "@/lib/server/api";
import { courseWeeks } from "@/lib/course";
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
  const input = nonEmpty(parse(CourseFields.partial().strict(), await body()));
  const datesChange = Boolean(input.start_date || input.target_date);
  // A change that sends only one of the two dates is checked against the saved other one.
  const saved = datesChange ? must(await db.from("courses").select("start_date, target_date").eq("id", id).single()) : undefined;
  const changes = checkDates(input, saved);
  const course = must(await db.from("courses").update(changes).eq("id", id).select().single());
  if (datesChange) {
    // A shorter course must not leave topics planned in weeks it no longer has: they move to its last week.
    const weeks = courseWeeks(course);
    must(await db.from("course_topics").update({ planned_week: weeks }).eq("course_id", id).gt("planned_week", weeks));
  }
  return course;
});

// Deletes its units and topics too.
export const DELETE = handle<{ id: string }>(async ({ db, params }) => {
  const id = parse(s.id, params.id);
  await archiveItem(db, "course", id);
  return ok;
});
