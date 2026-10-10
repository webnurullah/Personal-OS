import { handle } from "@/lib/server/api";
import { must } from "@/lib/server/http";
import { statusLabel } from "@/lib/library";
import { kindLabel } from "@/lib/projects";
import { parse, z } from "@/lib/server/validate";

// Ctrl+K search across your data (?q=). Returns at most 5 matches of each kind.
export const GET = handle(async ({ db, query }) => {
  const { q = "" } = parse(z.object({ q: z.string().max(80).optional() }), query);
  // Characters with a meaning in Supabase filters are turned into spaces.
  const term = q.replace(/[%_,()*\\"]/g, " ").trim();
  if (term.length < 2) return { items: [] };
  const like = `%${term}%`;

  const [tasks, notes, goals, events, habits, courses, transactions, projects, library, companies] = await Promise.all([
    db.from("tasks").select("id, title, due_date, done_at").ilike("title", like).order("created_at", { ascending: false }).limit(5).then(must),
    db.from("notes").select("id, title, tag").or(`title.ilike.${like},body.ilike.${like}`).limit(5).then(must),
    db.from("goals").select("id, title, status").ilike("title", like).limit(5).then(must),
    db.from("events").select("id, title, event_date").ilike("title", like).order("event_date", { ascending: false }).limit(5).then(must),
    db.from("habits").select("id, name").ilike("name", like).is("archived_at", null).limit(5).then(must),
    db.from("courses").select("id, title").ilike("title", like).limit(5).then(must),
    db.from("transactions").select("id, description, amount, tx_date").ilike("description", like).order("tx_date", { ascending: false }).limit(5).then(must),
    db.from("projects").select("id, name, kind, client").is("archived_at", null).or(`name.ilike.${like},client.ilike.${like}`).order("created_at", { ascending: false }).limit(5).then(must),
    db.from("learning_resources").select("id, title, platform, status").or(`title.ilike.${like},platform.ilike.${like}`).order("created_at", { ascending: false }).limit(5).then(must),
    db.from("companies").select("id, name, website").ilike("name", like).order("name").limit(5).then(must),
  ]);

  return {
    items: [
      ...tasks.map((t) => ({ type: "Task", id: t.id, title: t.title, hint: t.done_at ? "Done" : t.due_date || "No date", href: "/tasks" })),
      ...notes.map((n) => ({ type: "Note", id: n.id, title: n.title, hint: n.tag, href: "/notes" })),
      ...goals.map((g) => ({ type: "Goal", id: g.id, title: g.title, hint: g.status.replace("-", " "), href: "/goals" })),
      ...events.map((e) => ({ type: "Event", id: e.id, title: e.title, hint: e.event_date, href: `/calendar?date=${e.event_date}` })),
      ...habits.map((h) => ({ type: "Habit", id: h.id, title: h.name, hint: "Habit", href: "/habits" })),
      ...courses.map((c) => ({ type: "Course", id: c.id, title: c.title, hint: "Course", href: `/learning/${c.id}` })),
      ...projects.map((p) => ({ type: "Project", id: p.id, title: p.name, hint: p.client || kindLabel(p.kind), href: `/projects/${p.id}` })),
      ...library.map((r) => ({ type: "Library", id: r.id, title: r.title, hint: [r.platform, statusLabel(r.status)].filter(Boolean).join(" · "), href: "/learning/library" })),
      ...companies.map((c) => ({ type: "Company", id: c.id, title: c.name, hint: c.website ? c.website.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/+$/, "") : "Company", href: "/jobs/companies" })),
      ...transactions.map((t) => ({ type: "Transaction", id: t.id, title: t.description, hint: t.tx_date, href: `/finance?month=${t.tx_date.slice(0, 7)}` })),
    ],
  };
});
