import { handle } from "@/lib/server/api";
import { fetchAll } from "@/lib/server/paging";

const TABLES = [
  "categories", "tasks", "events", "goals", "goal_milestones", "habits", "habit_logs", "study_weeks", "study_blocks",
  "courses", "course_units", "course_topics", "budget_categories", "transactions", "bills", "health_logs", "notes", "reminders",
  "job_applications", "projects", "learning_resources", "archive_items",
] as const;

// Download everything as one JSON file.
export const GET = handle(async ({ db, profile, today }) => {
  const out: Record<string, unknown> = { exported_at: new Date().toISOString(), profile: await profile() };
  for (const table of TABLES) out[table] = await fetchAll(() => db.from(table).select("*"));
  return new Response(JSON.stringify(out), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="nurullah-pos-export-${await today()}.json"`,
    },
  });
});
