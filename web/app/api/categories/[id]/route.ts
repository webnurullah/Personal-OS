import { archiveItem } from "@/lib/server/archive";
import { handle, ok } from "@/lib/server/api";
import { must } from "@/lib/server/http";
import { CategoryCreate } from "@/lib/server/schemas";
import { nonEmpty, parse, s } from "@/lib/server/validate";

export const PATCH = handle<{ id: string }>(async ({ db, params, body }) => {
  const id = parse(s.id, params.id);
  const changes = nonEmpty(parse(CategoryCreate.partial().strict(), await body()));
  return must(await db.from("categories").update(changes).eq("id", id).select().single());
});

// Tasks, events and goals in this category keep existing, just without a category.
export const DELETE = handle<{ id: string }>(async ({ db, params }) => {
  const id = parse(s.id, params.id);
  await archiveItem(db, "category", id);
  return ok;
});
