import { handle, type Ctx } from "@/lib/server/api";
import { HttpError, must } from "@/lib/server/http";
import { parse, s } from "@/lib/server/validate";

type Params = { id: string; date: string };

/** Shared checks for ticking or unticking a day. */
async function logTarget({ db, params, today }: Ctx<Params>) {
  const id = parse(s.id, params.id);
  const date = parse(s.date, params.date);
  if (date > (await today())) throw new HttpError(400, "You cannot tick a day in the future.");
  must(await db.from("habits").select("id").eq("id", id).single()); // the habit must be yours
  return { id, date };
}

// Tick a day.
export const PUT = handle<Params>(async (ctx) => {
  const { id, date } = await logTarget(ctx);
  must(await ctx.db.from("habit_logs").upsert({ habit_id: id, log_date: date, user_id: ctx.user.id }, { onConflict: "habit_id,log_date", ignoreDuplicates: true }));
  return { ok: true, done: true };
});

// Untick a day.
export const DELETE = handle<Params>(async (ctx) => {
  const { id, date } = await logTarget(ctx);
  must(await ctx.db.from("habit_logs").delete().eq("habit_id", id).eq("log_date", date));
  return { ok: true, done: false };
});
