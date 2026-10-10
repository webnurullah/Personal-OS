import { handle } from "@/lib/server/api";
import { must } from "@/lib/server/http";
import { presentJob } from "@/lib/server/job-image";
import { JobCreate } from "@/lib/server/schemas";
import { parse } from "@/lib/server/validate";

// Saved jobs, nearest last date to apply first (jobs without one at the end).
export const GET = handle(async ({ db, user, today }) => {
  const rows = must(await db.from("job_applications").select("*").order("deadline", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }));
  return { today: await today(), items: rows.map((job) => presentJob(db, user.id, job)) };
});

// Save a job. Use POST /jobs/analyze first to fill the fields from a link.
export const POST = handle(async ({ db, user, body }) => {
  const input = parse(JobCreate, await body());
  return presentJob(db, user.id, must(await db.from("job_applications").insert(input).select().single()));
}, { status: 201 });
