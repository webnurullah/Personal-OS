import { handle } from "@/lib/server/api";
import { HttpError, must } from "@/lib/server/http";
import { METHODS } from "@/lib/server/schemas";
import { parse, s, z } from "@/lib/server/validate";

// Pay: adds the expense and marks the bill paid, in one database step
// (a monthly bill also gets next month's bill).
export const POST = handle<{ id: string }>(async ({ db, params, body, today }) => {
  const id = parse(s.id, params.id);
  const { method = "bKash" } = parse(z.object({ method: z.enum(METHODS).optional() }).strict(), (await body()) ?? {});
  const tx = must(await db.rpc("pay_bill", { p_bill_id: id, p_method: method, p_date: await today() }));
  if (!tx) throw new HttpError(500, "The bill could not be paid.");
  return tx;
}, { status: 201 });
