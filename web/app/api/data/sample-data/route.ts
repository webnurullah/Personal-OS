import { handle, ok } from "@/lib/server/api";
import { must } from "@/lib/server/http";

// Fill an empty account with the template's sample data.
export const POST = handle(async ({ db, today }) => {
  must(await db.rpc("load_sample_data", { p_today: await today() }));
  return ok;
}, { status: 201 });
