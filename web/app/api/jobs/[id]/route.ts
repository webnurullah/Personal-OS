import { archiveItem } from "@/lib/server/archive";
import { handle, ok } from "@/lib/server/api";
import { must } from "@/lib/server/http";
import { presentJob } from "@/lib/server/job-image";
import { JobFields } from "@/lib/server/schemas";
import { nonEmpty, parse, s } from "@/lib/server/validate";

export const PATCH = handle<{ id: string }>(async ({ db, user, params, body, today }) => {
  const id = parse(s.id, params.id);
  const changes = nonEmpty(parse(JobFields, await body()));
  // Marking a job applied records the day, unless a day was sent.
  if (changes.status === "applied" && changes.applied_on === undefined) changes.applied_on = await today();
  return presentJob(db, user.id, must(await db.from("job_applications").update(changes).eq("id", id).select().single()));
});

export const DELETE = handle<{ id: string }>(async ({ db, params }) => {
  const id = parse(s.id, params.id);
  await archiveItem(db, "job", id);
  return ok;
});
