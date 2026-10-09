import { handle } from "@/lib/server/api";
import { addDays, daysBetween, mondayOf } from "@/lib/server/dates";
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
  // Last dates to apply for jobs you have not applied to yet (shown on the calendar).
  const deadlines = must(
    await db.from("job_applications").select("id, title, company, deadline").eq("status", "saved").gte("deadline", from).lte("deadline", to).order("deadline"),
  ).map((j) => ({ id: j.id, title: j.title, company: j.company, date: j.deadline! }));
  // Due dates of active projects that have one (ongoing projects have none), shown on the calendar.
  const project_dates = must(
    await db.from("projects").select("id, name, color, due_date").eq("status", "active").is("archived_at", null).gte("due_date", from).lte("due_date", to).order("due_date"),
  ).map((p) => ({ id: `project-${p.id}`, project_id: p.id, title: p.name, kind: "deadline" as const, date: p.due_date!, color: p.color }));
  // Study sessions you planned (not done yet) on days in the range, shown on the calendar.
  const study = must(
    await db.from("study_blocks").select("id, week_start, weekday, hours, activity").eq("done", false).gte("week_start", mondayOf(from)).lte("week_start", to).order("week_start").order("weekday").order("created_at"),
  )
    .map((b) => ({ id: b.id, date: addDays(b.week_start, b.weekday), hours: Number(b.hours), activity: b.activity }))
    .filter((b) => b.date >= from && b.date <= to);
  const items = events
    .flatMap((event) => occurrences(event, from, to).map((date) => ({ ...event, date })))
    .sort((a, b) => a.date.localeCompare(b.date) || byTime(a, b));
  return { today: await today(), from, to, items, deadlines, project_dates, study };
});

export const POST = handle(async ({ db, body }) => {
  const input = checkTimes(parse(EventFields, await body()));
  if (!input.all_day && (!input.start_time || !input.end_time)) throw new HttpError(400, "Add a start and end time, or make it an all-day event.");
  return must(await db.from("events").insert(input).select().single());
}, { status: 201 });
