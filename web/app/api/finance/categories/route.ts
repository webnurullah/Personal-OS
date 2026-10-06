import { handle } from "@/lib/server/api";
import { must } from "@/lib/server/http";
import { BudgetCategoryFields } from "@/lib/server/schemas";
import { parse } from "@/lib/server/validate";

export const POST = handle(async ({ db, body }) => {
  const input = parse(BudgetCategoryFields, await body());
  if (input.position === undefined) {
    const { count } = await db.from("budget_categories").select("id", { count: "exact", head: true });
    input.position = count ?? 0;
  }
  return must(await db.from("budget_categories").insert(input).select().single());
}, { status: 201 });
