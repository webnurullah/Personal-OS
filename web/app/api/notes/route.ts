import { handle } from "@/lib/server/api";
import { must } from "@/lib/server/http";
import { NoteFields } from "@/lib/server/schemas";
import { parse } from "@/lib/server/validate";

export const GET = handle(async ({ db, today }) => {
  const items = must(await db.from("notes").select("*").order("pinned", { ascending: false }).order("updated_at", { ascending: false }));
  return { today: await today(), items };
});

export const POST = handle(async ({ db, body }) => {
  const input = parse(NoteFields, await body());
  return must(await db.from("notes").insert(input).select().single());
}, { status: 201 });
