import { handle } from "@/lib/server/api";
import { autoCheckHabits } from "@/lib/server/habit-time";
import { pauseTimer, startTimer, timeState } from "@/lib/server/project-time";
import { parse, s, z } from "@/lib/server/validate";

// The time spent on a library item (a certificate course) and whether a timer is running. The time also counts on the course the item is linked to.
export const GET = handle<{ id: string }>(async ({ db, params, today, profile }) => {
  const id = parse(s.id, params.id);
  return timeState(db, "resource", id, (await profile()).timezone, await today());
});

// { action: "start" } starts the timer (a timer running elsewhere is stopped); { action: "pause" } pauses it.
export const POST = handle<{ id: string }>(async ({ db, params, body, today, profile }) => {
  const id = parse(s.id, params.id);
  const { action } = parse(z.object({ action: z.enum(["start", "pause"]) }).strict(), await body());
  if (action === "start") await startTimer(db, "resource", id);
  else await pauseTimer(db, "resource", id);
  await autoCheckHabits(db, await today(), (await profile()).timezone);
  return timeState(db, "resource", id, (await profile()).timezone, await today());
});
