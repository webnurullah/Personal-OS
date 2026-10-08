import { archiveItem } from "@/lib/server/archive";
import { handle, ok } from "@/lib/server/api";
import { applyChange, certificateDatesProblem } from "@/lib/library";
import { HttpError, must } from "@/lib/server/http";
import { resolveSubject } from "@/lib/server/resources-db";
import { ResourceFields } from "@/lib/server/schemas";
import { nonEmpty, parse, s } from "@/lib/server/validate";

// Change one item. The status, the counts and the dates are kept in step (finishing the last video completes it).
export const PATCH = handle<{ id: string }>(async ({ db, params, body, today }) => {
  const id = parse(s.id, params.id);
  const changes = nonEmpty(parse(ResourceFields, await body()));
  const current = must(await db.from("learning_resources").select("*").eq("id", id).single());
  const row = applyChange(current, changes, await today());

  const problem = certificateDatesProblem(row.issued_on ?? current.issued_on, row.expires_on ?? current.expires_on);
  if (problem) throw new HttpError(400, problem);

  // A new course takes the unit away (the unit belongs to the old course) unless a unit of the new course is sent.
  if (row.course_id !== undefined && row.course_id !== current.course_id && row.unit_id === undefined) row.unit_id = null;
  Object.assign(row, await resolveSubject(db, row));

  return must(await db.from("learning_resources").update(row).eq("id", id).select().single());
});

// Moves to the Archive (the certificate and the notes come back if you restore it).
export const DELETE = handle<{ id: string }>(async ({ db, params }) => {
  const id = parse(s.id, params.id);
  await archiveItem(db, "resource", id);
  return ok;
});
