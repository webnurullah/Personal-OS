import { handle } from "@/lib/server/api";
import { mondayOf } from "@/lib/server/dates";
import { dbError, must } from "@/lib/server/http";
import { courseSummaries } from "@/lib/server/queries";
import { parse, s, z } from "@/lib/server/validate";

// One study week (?start=YYYY-MM-DD, default this week): its topic, goal, planned blocks, and every course's progress.
export const GET = handle(async ({ db, query, today: getToday, profile }) => {
  const today = await getToday();
  const { start } = parse(z.object({ start: s.date.optional() }), query);
  const weekStart = mondayOf(start || today);
  const [week, blocks, courses, me] = await Promise.all([
    db.from("study_weeks").select("*").eq("week_start", weekStart).maybeSingle(),
    db.from("study_blocks").select("*").eq("week_start", weekStart).order("weekday").order("created_at"),
    courseSummaries(db, today),
    profile(),
  ]);
  if (week.error) throw dbError(week.error);
  return {
    today,
    week_start: weekStart,
    topic: week.data?.topic ?? "",
    goal_hours: Number(week.data?.goal_hours ?? me.weekly_study_goal),
    blocks: must(blocks),
    courses,
  };
});
