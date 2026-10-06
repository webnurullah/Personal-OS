import { handle } from "@/lib/server/api";
import { habitBoard } from "@/lib/server/habits";
import { must } from "@/lib/server/http";
import { loadHabits } from "@/lib/server/queries";
import { HabitCreate } from "@/lib/server/schemas";
import { parse, z } from "@/lib/server/validate";

export const GET = handle(async ({ db, query, today: getToday }) => {
  const today = await getToday();
  const { days } = parse(z.object({ days: z.coerce.number().int().min(1).max(14).optional() }), query);
  const { habits, logs } = await loadHabits(db, today);
  return { today, ...habitBoard(habits, logs, today, days || 7) };
});

export const POST = handle(async ({ db, body }) => {
  const input = parse(HabitCreate, await body());
  if (input.position === undefined) {
    const { count } = await db.from("habits").select("id", { count: "exact", head: true });
    input.position = count ?? 0;
  }
  return must(await db.from("habits").insert(input).select().single());
}, { status: 201 });
