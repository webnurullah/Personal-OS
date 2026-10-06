import { forgetProfile, handle, ok } from "@/lib/server/api";
import { must } from "@/lib/server/http";

// "Mark all as read".
export const POST = handle(async ({ db, user }) => {
  must(await db.from("profiles").update({ notifications_read_at: new Date().toISOString() }).eq("id", user.id).select("id").single());
  forgetProfile(user.id);
  return ok;
});
