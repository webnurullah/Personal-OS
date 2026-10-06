import { archiveItem } from "@/lib/server/archive";
import { handle, ok } from "@/lib/server/api";
import { must } from "@/lib/server/http";
import { BillFields } from "@/lib/server/schemas";
import { nonEmpty, parse, s } from "@/lib/server/validate";

// Only unpaid bills can be changed.
export const PATCH = handle<{ id: string }>(async ({ db, params, body }) => {
  const id = parse(s.id, params.id);
  const changes = nonEmpty(parse(BillFields.partial().strict(), await body()));
  return must(await db.from("bills").update(changes).eq("id", id).is("paid_at", null).select().single());
});

export const DELETE = handle<{ id: string }>(async ({ db, params }) => {
  const id = parse(s.id, params.id);
  await archiveItem(db, "bill", id);
  return ok;
});
