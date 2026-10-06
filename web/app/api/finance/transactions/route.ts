import { handle } from "@/lib/server/api";
import { must } from "@/lib/server/http";
import { tidy, TxFields } from "@/lib/server/schemas";
import { parse } from "@/lib/server/validate";

export const POST = handle(async ({ db, body }) => {
  const input = tidy(parse(TxFields, await body()));
  return must(await db.from("transactions").insert(input).select().single());
}, { status: 201 });
