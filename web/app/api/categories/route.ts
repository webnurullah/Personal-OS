import { handle } from "@/lib/server/api";
import { must } from "@/lib/server/http";
import { CategoryCreate } from "@/lib/server/schemas";
import { parse } from "@/lib/server/validate";

export const GET = handle(async ({ db }) => {
  const items = must(await db.from("categories").select("*").order("position").order("created_at"));
  return { items };
});

export const POST = handle(async ({ db, body }) => {
  const input = parse(CategoryCreate, await body());
  if (input.position === undefined) {
    const { count } = await db.from("categories").select("id", { count: "exact", head: true });
    input.position = count ?? 0;
  }
  return must(await db.from("categories").insert(input).select().single());
}, { status: 201 });
