import { handle } from "@/lib/server/api";
import { must } from "@/lib/server/http";
import { courseSummaries } from "@/lib/server/queries";
import { checkDates, CourseFields } from "@/lib/server/schemas";
import { parse } from "@/lib/server/validate";

export const GET = handle(async ({ db, today: getToday }) => {
  const today = await getToday();
  return { today, items: await courseSummaries(db, today) };
});

export const POST = handle(async ({ db, body }) => {
  const input = checkDates(parse(CourseFields, await body()));
  return must(await db.from("courses").insert(input).select().single());
}, { status: 201 });
