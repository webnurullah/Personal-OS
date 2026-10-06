import { forgetProfile, handle } from "@/lib/server/api";
import type { Json } from "@/lib/server/database.types";
import { must } from "@/lib/server/http";
import { presentProfile } from "@/lib/server/profile";
import { ProfileUpdate } from "@/lib/server/schemas";
import type { Row } from "@/lib/server/supabase";
import { nonEmpty, parse } from "@/lib/server/validate";

export const GET = handle(async (ctx) => presentProfile(ctx, await ctx.profile()));

export const PATCH = handle(async (ctx) => {
  const { notify, ...rest } = nonEmpty(parse(ProfileUpdate, await ctx.body()));
  const changes: Partial<Row<"profiles">> = { ...rest };
  if (notify) {
    const current = (await ctx.profile()).notify as Record<string, boolean>;
    changes.notify = { ...current, ...notify } as Json;
  }
  const profile = must(await ctx.db.from("profiles").update(changes).eq("id", ctx.user.id).select().single());
  forgetProfile(ctx.user.id);
  return presentProfile(ctx, profile);
});
