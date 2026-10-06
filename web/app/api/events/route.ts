import { handle } from "@/lib/server/api";
import { addDays, daysBetween } from "@/lib/server/dates";
import { HttpError, must } from "@/lib/server/http";
import { fetchAll } from "@/lib/server/paging";
import { byTime, occurrences } from "@/lib/server/recurrence";
import { checkTimes, EventFields } from "@/lib/server/schemas";
import { parse, s, z } from "@/lib/server/validate";

// Every day an event happens between ?from and ?to (repeating events expanded).
export const GET = handle(async ({ db, query, today }) => {
  const range = parse(z.object({ from: s.date, to: s.date }).partial(), query);
  const from = range.from || (await today());
  const to = range.to || addDays(from, 41);
  const span = daysBetween(from, to);
  if (span < 0 || span > 93) throw new HttpError(400, "Ask for at most three months at a time.");

  const events = await fetchAll(() =>
    db.from("events").select("*")
      .lte("event_date", to)
      .or(`repeat.neq.none,event_date.gte.${from}`) // skip old one-off events
      .order("event_date"),
  );
  const items = events
    .flatMap((event) => occurrences(event, from, to).map((date) => ({ ...event, date })))
    .sort((a, b) => a.date.localeCompare(b.date) || byTime(a, b));
  return { today: await today(), from, to, items };
});

export const POST = handle(async ({ db, body }) => {
  const input = checkTimes(parse(EventFields, await body()));
  if (!input.all_day && (!input.start_time || !input.end_time)) throw new HttpError(400, "Add a start and end time, or make it an all-day event.");
  return must(await db.from("events").insert(input).select().single());
}, { status: 201 });
