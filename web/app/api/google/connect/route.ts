import { handle } from "@/lib/server/api";
import { authUrl, makeState, redirectUri, requireGoogle } from "@/lib/server/google";

// The address of Google's "allow access" page. The state proves the person who comes back is the one who left.
export const POST = handle(async ({ req, user }) => {
  const config = requireGoogle();
  return { url: authUrl(config, redirectUri(req.headers), makeState(user.id, config.key, Date.now())) };
});
