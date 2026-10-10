import { handle } from "@/lib/server/api";
import { HttpError, must } from "@/lib/server/http";
import { CompanyFields } from "@/lib/server/schemas";
import { parse } from "@/lib/server/validate";

// The company list (Job Apply → Company list), A to Z.
export const GET = handle(async ({ db, today }) => {
  const items = must(await db.from("companies").select("*").order("name"));
  return { today: await today(), items };
});

export const POST = handle(async ({ db, body }) => {
  const input = parse(CompanyFields, await body());
  const { data, error } = await db.from("companies").insert(input).select().single();
  if (error?.code === "23505") throw new HttpError(409, "This company is already in your list.");
  return must({ data, error });
}, { status: 201 });
