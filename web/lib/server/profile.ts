import type { Ctx } from "./api.ts";
import { avatarUrl } from "./avatar.ts";
import { todayIn } from "./dates.ts";
import type { Row } from "./supabase.ts";

/** The profile as the app receives it: the sign-in email, today's date in your time zone and the photo address. */
export function presentProfile(ctx: Ctx<object>, profile: Row<"profiles">) {
  const { avatar_path, ...rest } = profile;
  return { ...rest, email: ctx.user.email, today: todayIn(profile.timezone), avatar_url: avatarUrl(ctx.db, ctx.user.id, avatar_path) };
}
