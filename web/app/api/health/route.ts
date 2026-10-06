import { handle } from "@/lib/server/api";
import { addDays } from "@/lib/server/dates";
import { must } from "@/lib/server/http";
import { parse, z } from "@/lib/server/validate";

// The last N days (?days=, default 30) of health logs, oldest first, and your goals.
export const GET = handle(async ({ db, query, today: getToday, profile: getProfile }) => {
  const [profile, today] = await Promise.all([getProfile(), getToday()]);
  const { days = 30 } = parse(z.object({ days: z.coerce.number().int().min(1).max(366).optional() }), query);
  const logs = must(await db.from("health_logs").select("*").gte("log_date", addDays(today, -(days - 1))).lte("log_date", today).order("log_date"));
  return {
    today,
    goals: { steps: profile.step_goal, sleep_minutes: profile.sleep_goal_minutes, water: profile.water_goal },
    logs,
  };
});
