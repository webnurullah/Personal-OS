import { archiveItem } from "@/lib/server/archive";
import { handle, ok } from "@/lib/server/api";
import { HttpError, must } from "@/lib/server/http";
import { CompanyFields } from "@/lib/server/schemas";
import { nonEmpty, parse, s } from "@/lib/server/validate";

export const PATCH = handle<{ id: string }>(async ({ db, params, body }) => {
  const id = parse(s.id, params.id);
  const changes = nonEmpty(parse(CompanyFields.partial().strict(), await body()));
  const { data, error } = await db.from("companies").update(changes).eq("id", id).select().single();
  if (error?.code === "23505") throw new HttpError(409, "Another company in your list has this name.");
  return must({ data, error });
});

export const DELETE = handle<{ id: string }>(async ({ db, params }) => {
  const id = parse(s.id, params.id);
  await archiveItem(db, "company", id);
  return ok;
});
