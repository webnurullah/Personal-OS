import { handle } from "@/lib/server/api";
import { learningProgress } from "@/lib/server/progress";

// Hours studied, study days, finished topics and where the time went: by week, month and quarter.
export const GET = handle(async ({ db, today: getToday, profile }) => {
  const today = await getToday();
  const me = await profile();
  const weeklyGoal = Number(me.weekly_study_goal);
  return { today, weekly_goal: weeklyGoal, ...(await learningProgress(db, today, me.timezone, weeklyGoal)) };
});
