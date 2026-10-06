import { handle } from "@/lib/server/api";
import { must } from "@/lib/server/http";
import { monday, WeekUpdate } from "@/lib/server/schemas";
import { nonEmpty, parse } from "@/lib/server/validate";

// Set a week's topic or goal (creates the week if needed).
export const PUT = handle<{ start: string }>(async ({ db, params, body, user }) => {
  const weekStart = parse(monday, params.start);
  const changes = nonEmpty(parse(WeekUpdate, await body()));
  return must(
    await db.from("study_weeks")
      .upsert({ ...changes, user_id: user.id, week_start: weekStart }, { onConflict: "user_id,week_start" })
      .select().single(),
  );
});
