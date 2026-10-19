import { handle } from "@/lib/server/api";
import { autoCheckHabits } from "@/lib/server/habit-time";
import { runningTimers } from "@/lib/server/project-time";

// Every timer that is running now (projects, courses, certificate courses), for the circles shown on every page.
// A running timer can reach a habit's daily goal while it runs, so the habits are checked here as well.
export const GET = handle(async ({ db, today, profile }) => {
  const ticked = await autoCheckHabits(db, await today(), (await profile()).timezone);
  return { ...(await runningTimers(db)), ticked: ticked.length };
});
