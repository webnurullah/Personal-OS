import { handle } from "@/lib/server/api";
import { dateIn } from "@/lib/server/dates";
import { must } from "@/lib/server/http";
import { fetchAll } from "@/lib/server/paging";
import { kindLabel } from "@/lib/projects";

// Everything waiting in the Archive: deleted items, and projects you archived. Newest first.
// (The saved copy of each item is not sent here, only what the list shows.)
export const GET = handle(async ({ db, today, profile }) => {
  const zone = (await profile()).timezone;
  const [saved, projects] = await Promise.all([
    fetchAll(() => db.from("archive_items").select("id, kind, title, detail, related, deleted_at").order("deleted_at", { ascending: false }).order("id")),
    db.from("projects").select("id, name, kind, color, archived_at").not("archived_at", "is", null).then(must),
  ]);
  // How many tasks go with each archived project when it is deleted for good.
  const taskCount = new Map<string, number>();
  if (projects.length) {
    const ids = projects.map((p) => p.id);
    for (const t of await fetchAll(() => db.from("tasks").select("project_id").in("project_id", ids).order("id"))) {
      if (t.project_id) taskCount.set(t.project_id, (taskCount.get(t.project_id) ?? 0) + 1);
    }
  }

  const items = [
    ...saved.map((item) => ({ ...item, source: "item" as const, color: null, deleted_on: dateIn(new Date(item.deleted_at), zone) })),
    ...projects.map((p) => ({
      id: p.id,
      source: "project" as const,
      kind: "project",
      title: p.name,
      detail: kindLabel(p.kind),
      related: taskCount.get(p.id) ?? 0,
      deleted_at: p.archived_at as string,
      deleted_on: dateIn(new Date(p.archived_at as string), zone),
      color: p.color,
    })),
  ].sort((a, b) => (a.deleted_at < b.deleted_at ? 1 : a.deleted_at > b.deleted_at ? -1 : 0));
  return { today: await today(), items };
});
