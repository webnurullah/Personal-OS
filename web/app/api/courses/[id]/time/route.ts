import { handle } from "@/lib/server/api";
import { pauseTimer, startTimer, timeState } from "@/lib/server/project-time";
import { parse, s, z } from "@/lib/server/validate";

// The time spent on a course and whether a timer is running (on any project or course).
export const GET = handle<{ id: string }>(async ({ db, params, today, profile }) => {
  const id = parse(s.id, params.id);
  return timeState(db, "course", id, (await profile()).timezone, await today());
});

// { action: "start" } starts the timer (a timer running elsewhere is stopped); { action: "pause" } pauses it.
// Both answer with the new state. The time already spent is kept: starting again carries on from it.
export const POST = handle<{ id: string }>(async ({ db, params, body, today, profile }) => {
  const id = parse(s.id, params.id);
  const { action } = parse(z.object({ action: z.enum(["start", "pause"]) }).strict(), await body());
  if (action === "start") await startTimer(db, "course", id);
  else await pauseTimer(db, "course", id);
  return timeState(db, "course", id, (await profile()).timezone, await today());
});
