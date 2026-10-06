import { handle, ok } from "@/lib/server/api";
import { HttpError, must } from "@/lib/server/http";
import { progress, timeframe } from "@/lib/projects";
import { checkProjectDates, ProjectFields } from "@/lib/server/schemas";
import { nonEmpty, parse, s } from "@/lib/server/validate";

// One project with its tasks: every open task, and the newest 100 finished ones (the count of all finished ones is exact).
export const GET = handle<{ id: string }>(async ({ db, params, today }) => {
  const id = parse(s.id, params.id);
  const [project, open, done, doneCount] = await Promise.all([
    db.from("projects").select("*").eq("id", id).single().then(must),
    db.from("tasks").select("*").eq("project_id", id).is("done_at", null).order("due_date", { ascending: true, nullsFirst: false }).order("created_at").then(must),
    db.from("tasks").select("*").eq("project_id", id).not("done_at", "is", null).order("done_at", { ascending: false }).limit(100).then(must),
    db.from("tasks").select("id", { count: "exact", head: true }).eq("project_id", id).not("done_at", "is", null),
  ]);
  if (doneCount.error) must({ data: null, error: doneCount.error });
  const finished = doneCount.count ?? done.length;
  const t = await today();
  return {
    today: t,
    project: { ...project, timeframe: timeframe(project, t), tasks_total: open.length + finished, tasks_done: finished, tasks_open: open.length, percent: progress(finished, open.length + finished) },
    tasks: [...open, ...done],
  };
});

export const PATCH = handle<{ id: string }>(async ({ db, params, body }) => {
  const id = parse(s.id, params.id);
  const { archived, ...fields } = checkProjectDates(nonEmpty(parse(ProjectFields, await body())));
  // "archived" is a switch: true moves it to the Archive now, false brings it back.
  const changes = archived === undefined ? fields : { ...fields, archived_at: archived ? new Date().toISOString() : null };
  return must(await db.from("projects").update(changes).eq("id", id).select().single());
});

// Deletes the project for good, and its tasks too. Only an archived project can be deleted:
// removing a project always goes through the Archive first.
export const DELETE = handle<{ id: string }>(async ({ db, params }) => {
  const id = parse(s.id, params.id);
  const found = must(await db.from("projects").select("archived_at").eq("id", id).single());
  if (!found.archived_at) throw new HttpError(400, "Archive the project first, then delete it from the Archive.");
  must(await db.from("projects").delete().eq("id", id).select("id").single());
  return ok;
});
