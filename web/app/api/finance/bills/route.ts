import { handle } from "@/lib/server/api";
import { must } from "@/lib/server/http";
import { BillFields } from "@/lib/server/schemas";
import { parse } from "@/lib/server/validate";

export const POST = handle(async ({ db, body }) => {
  const input = parse(BillFields, await body());
  return must(await db.from("bills").insert(input).select().single());
}, { status: 201 });
