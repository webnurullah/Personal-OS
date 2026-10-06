import { handle } from "@/lib/server/api";
import { must } from "@/lib/server/http";
import { ReminderFields } from "@/lib/server/schemas";
import { parse } from "@/lib/server/validate";

// Open reminders, plus ticked ones added in the last 30 days.
export const GET = handle(async ({ db, today }) => {
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const items = must(
    await db.from("reminders").select("*")
      .or(`done.eq.false,created_at.gte."${since}"`)
      .order("done")
      .order("due_date", { nullsFirst: false })
      .order("created_at"),
  );
  return { today: await today(), items };
});

export const POST = handle(async ({ db, body }) => {
  const input = parse(ReminderFields, await body());
  return must(await db.from("reminders").insert(input).select().single());
}, { status: 201 });
