import { handle } from "@/lib/server/api";
import { tasksForWeek } from "@/lib/server/study-tasks";
import { WeekTasksInput } from "@/lib/server/schemas";
import { parse, s } from "@/lib/server/validate";

// Makes a task for each topic still to study in a week of the course (this week unless "week" is given).
export const POST = handle<{ id: string }>(async ({ db, params, body, today }) => {
  const id = parse(s.id, params.id);
  const input = parse(WeekTasksInput, (await body()) ?? {});
  return tasksForWeek(db, id, await today(), input.week);
}, { status: 201 });
