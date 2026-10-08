import { handle } from "@/lib/server/api";
import { must } from "@/lib/server/http";
import { practicePlan } from "@/lib/practice-templates";
import { parse, s } from "@/lib/server/validate";

// Makes a practice project for a library item: a project (Projects page) with 6-8 small tasks that turn what you
// learned into something you did (redo it, apply it, publish proof, teach it back, get feedback, add it to your profile).
// Asking again opens the project that already exists.
export const POST = handle<{ id: string }>(async ({ db, params, today }) => {
  const id = parse(s.id, params.id);
  const item = must(await db.from("learning_resources").select("*").eq("id", id).single());

  if (item.practice_project_id) {
    const existing = must(await db.from("projects").select("id, archived_at").eq("id", item.practice_project_id).maybeSingle());
    if (existing && !existing.archived_at) return { project_id: existing.id, created: false };
  }

  const plan = practicePlan({ title: item.title, skills: item.skills, takeaway: item.takeaway }, await today());
  const project = must(await db.from("projects").insert(plan.project).select("id").single());
  try {
    must(await db.from("tasks").insert(plan.tasks.map((task) => ({ ...task, project_id: project.id }))));
    // Link it only if nobody linked another one in the meantime (a double click, a second tab): the update says whether it won.
    const claim = db.from("learning_resources").update({ practice_project_id: project.id }).eq("id", id);
    const won = must(await (item.practice_project_id ? claim.eq("practice_project_id", item.practice_project_id) : claim.is("practice_project_id", null)).select("id"));
    if (!won.length) {
      // Lost the race: drop the project just made and open the one that won.
      await db.from("projects").delete().eq("id", project.id);
      const current = must(await db.from("learning_resources").select("practice_project_id").eq("id", id).single());
      return { project_id: current.practice_project_id, created: false };
    }
  } catch (error) {
    // All or nothing: no half-made project is left behind (its tasks go with it).
    await db.from("projects").delete().eq("id", project.id);
    throw error;
  }
  return { project_id: project.id, created: true };
});
