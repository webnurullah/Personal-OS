import { handle } from "@/lib/server/api";
import { must } from "@/lib/server/http";
import { BlockCreate } from "@/lib/server/schemas";
import { checkBlockLinks } from "@/lib/server/study";
import { parse } from "@/lib/server/validate";

export const POST = handle(async ({ db, body }) => {
  const input = parse(BlockCreate, await body());
  await checkBlockLinks(db, input);
  return must(await db.from("study_blocks").insert(input).select().single());
}, { status: 201 });
