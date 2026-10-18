import { handle } from "@/lib/server/api";
import { timeSummary } from "@/lib/server/project-time";
import { parse, z } from "@/lib/server/validate";

// Time spent per project and per day (the last ?days=7, up to 31), for the Habits page.
export const GET = handle(async ({ db, query, today, profile }) => {
  const { days } = parse(z.object({ days: z.coerce.number().int().min(1).max(31).default(7) }), query);
  return timeSummary(db, (await profile()).timezone, await today(), days);
});
