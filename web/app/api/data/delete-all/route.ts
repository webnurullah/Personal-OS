import { forgetProfile, handle, ok } from "@/lib/server/api";
import { must } from "@/lib/server/http";
import { parse, z } from "@/lib/server/validate";

// Delete every task, note, transaction … (the account and profile stay).
export const POST = handle(async ({ db, body, user }) => {
  parse(z.object({ confirm: z.literal("DELETE", { message: "Type DELETE to confirm" }) }).strict(), await body());
  must(await db.rpc("delete_my_data"));
  forgetProfile(user.id);
  return ok;
});
