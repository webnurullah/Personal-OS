import { handle } from "@/lib/server/api";
import { applyChange, certificateDatesProblem, NEW_FACTS, readLink } from "@/lib/library";
import { HttpError, must } from "@/lib/server/http";
import { fetchAll } from "@/lib/server/paging";
import { resolveSubject } from "@/lib/server/resources-db";
import { ResourceCreate } from "@/lib/server/schemas";
import { parse } from "@/lib/server/validate";

// Everything in the Learning library: courses, playlists, videos and books (the page sorts and groups them).
export const GET = handle(async ({ db, today }) => {
  // Past 1,000 items Supabase would cut the list short, so it is read page by page.
  const items = await fetchAll(() => db.from("learning_resources").select("*").order("created_at", { ascending: false }).order("id"));
  return { today: await today(), items };
});

export const POST = handle(async ({ db, body, today }) => {
  const input = parse(ResourceCreate, await body());
  const row = applyChange(NEW_FACTS, input, await today());
  const problem = certificateDatesProblem(row.issued_on, row.expires_on);
  if (problem) throw new HttpError(400, problem);
  const subject = await resolveSubject(db, row);
  const platform = row.platform || (row.url ? readLink(row.url).platform : "");
  return must(await db.from("learning_resources").insert({ ...row, ...subject, platform, title: input.title }).select().single());
}, { status: 201 });
