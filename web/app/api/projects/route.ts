import { handle } from "@/lib/server/api";
import { must } from "@/lib/server/http";
import { summarise } from "@/lib/projects";
import { withDays } from "@/lib/server/projects";
import { checkProjectDates, ProjectCreate } from "@/lib/server/schemas";
import { fetchAll } from "@/lib/server/paging";
import { parse, z } from "@/lib/server/validate";

// Your projects with task progress and how they stand in time (all worked out here, never stored).
// ?archived=1 lists the archived ones instead (the Archive page).
// ?lite=1 is the short list for pickers (the task form): id, name, colour, status and whether it is archived.
export const GET = handle(async ({ db, query, today, profile }) => {
  const { lite, archived } = parse(z.object({ lite: z.literal("1").optional(), archived: z.literal("1").optional() }), query);
  if (lite) return { items: must(await db.from("projects").select("id, name, color, status, archived_at").order("name")) };

  const base = db.from("projects").select("id, name, kind, status, color, client, goal, start_date, due_date, archived_at, created_at");
  const [projects, tasks] = await Promise.all([
    (archived ? base.not("archived_at", "is", null).order("archived_at", { ascending: false }) : base.is("archived_at", null).order("created_at", { ascending: false })).then(must),
    // Past 1,000 linked tasks Supabase would cut the list short, so it is read page by page.
    fetchAll(() => db.from("tasks").select("project_id, done_at").not("project_id", "is", null).order("id")),
  ]);
  const t = await today();
  const zone = (await profile()).timezone;
  return { today: t, items: summarise(projects.map((p) => withDays(p, zone)), tasks, t) };
});

export const POST = handle(async ({ db, body }) => {
  const input = checkProjectDates(parse(ProjectCreate, await body()));
  return must(await db.from("projects").insert(input).select().single());
}, { status: 201 });
