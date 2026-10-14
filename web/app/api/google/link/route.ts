import { handle, ok } from "@/lib/server/api";
import { checkState, encryptToken, exchangeCode, forgetGoogle, redirectUri, requireGoogle } from "@/lib/server/google";
import { HttpError, must } from "@/lib/server/http";
import { parse, z } from "@/lib/server/validate";

// Google sent the person back with a code: swap it for the long-lasting link and keep that, encrypted.
export const POST = handle(async ({ req, user, db, body }) => {
  const input = parse(z.object({ code: z.string().min(1).max(2000), state: z.string().min(1).max(500) }).strict(), await body());
  const config = requireGoogle();
  if (!checkState(input.state, user.id, config.key, Date.now())) throw new HttpError(400, "That sign-in link is no longer valid. Go to Settings and press Connect again.");
  const link = await exchangeCode(config, input.code, redirectUri(req.headers));
  must(
    await db.from("google_connections").upsert(
      { user_id: user.id, google_email: link.email.slice(0, 320), refresh_token_enc: encryptToken(link.refresh, config.key), scope: link.scope.slice(0, 1000), status: "ok", connected_at: new Date().toISOString() },
      { onConflict: "user_id" },
    ).select("user_id").single(),
  );
  forgetGoogle(user.id);
  return { ...ok, email: link.email };
});
