import { handle } from "@/lib/server/api";
import { must } from "@/lib/server/http";
import { checkTaskDates, TaskCreate } from "@/lib/server/schemas";
import { parse } from "@/lib/server/validate";

// Open tasks, plus tasks finished in the last 14 days.
export const GET = handle(async ({ db, today }) => {
  const since = new Date(Date.now() - 14 * 86400000).toISOString();
  const items = must(
    await db.from("tasks").select("*")
      .or(`done_at.is.null,done_at.gte."${since}"`)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at"),
  );
  return { today: await today(), items };
});

export const POST = handle(async ({ db, body }) => {
  const input = checkTaskDates(parse(TaskCreate, await body()));
  return must(await db.from("tasks").insert(input).select().single());
}, { status: 201 });
