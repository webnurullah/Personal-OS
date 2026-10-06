import { handle } from "@/lib/server/api";
import { HttpError, must } from "@/lib/server/http";
import { HealthFields } from "@/lib/server/schemas";
import { nonEmpty, parse, s } from "@/lib/server/validate";

// Save one day (only the fields you send change).
export const PUT = handle<{ date: string }>(async ({ db, params, body, today, user }) => {
  const date = parse(s.date, params.date);
  if (date > (await today())) throw new HttpError(400, "You cannot log a day in the future.");
  const changes = nonEmpty(parse(HealthFields, await body()));
  return must(
    await db.from("health_logs")
      .upsert({ ...changes, user_id: user.id, log_date: date }, { onConflict: "user_id,log_date" })
      .select().single(),
  );
});
