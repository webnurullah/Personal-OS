import { handle, ok } from "@/lib/server/api";
import { must } from "@/lib/server/http";
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
  const changes = checkProjectDates(nonEmpty(parse(ProjectFields, await body())));
  return must(await db.from("projects").update(changes).eq("id", id).select().single());
});

// Deletes the project's tasks too.
export const DELETE = handle<{ id: string }>(async ({ db, params }) => {
  const id = parse(s.id, params.id);
  must(await db.from("projects").delete().eq("id", id).select("id").single());
  return ok;
});
