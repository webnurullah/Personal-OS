import { handle, ok } from "@/lib/server/api";
import { must } from "@/lib/server/http";
import { BudgetCategoryFields } from "@/lib/server/schemas";
import { nonEmpty, parse, s } from "@/lib/server/validate";

export const PATCH = handle<{ id: string }>(async ({ db, params, body }) => {
  const id = parse(s.id, params.id);
  const changes = nonEmpty(parse(BudgetCategoryFields.partial().strict(), await body()));
  return must(await db.from("budget_categories").update(changes).eq("id", id).select().single());
});

// Transactions in the category keep existing, without a category.
export const DELETE = handle<{ id: string }>(async ({ db, params }) => {
  const id = parse(s.id, params.id);
  must(await db.from("budget_categories").delete().eq("id", id).select("id").single());
  return ok;
});
