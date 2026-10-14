import { handle, ok } from "@/lib/server/api";
import { decryptToken, forgetGoogle, googleConfig, revokeToken } from "@/lib/server/google";
import { must } from "@/lib/server/http";

// Forget the Google link: Google is told to drop it and the saved (encrypted) token is deleted.
export const POST = handle(async ({ db, user }) => {
  const config = googleConfig();
  const row = must(await db.from("google_connections").select("refresh_token_enc").maybeSingle());
  if (row && config) {
    const token = decryptToken(row.refresh_token_enc, config.key);
    if (token) await revokeToken(token);
  }
  must(await db.from("google_connections").delete().eq("user_id", user.id));
  forgetGoogle(user.id);
  return ok;
});
