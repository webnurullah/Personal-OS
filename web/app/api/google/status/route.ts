import { handle } from "@/lib/server/api";
import { googleConfig } from "@/lib/server/google";
import { must } from "@/lib/server/http";

// Is Google Calendar set up on the server, and is this person connected?
export const GET = handle(async ({ db }) => {
  const configured = googleConfig() !== null;
  const row = must(await db.from("google_connections").select("google_email, status, connected_at").maybeSingle());
  return { configured, connected: row !== null, email: row?.google_email ?? "", status: row?.status ?? "off", connected_at: row?.connected_at ?? null };
});
