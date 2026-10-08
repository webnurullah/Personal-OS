import { handle } from "@/lib/server/api";
import { readLink, titleFromLink } from "@/lib/library";
import { must } from "@/lib/server/http";
import { resolveSubject } from "@/lib/server/resources-db";
import { ResourceBulk } from "@/lib/server/schemas";
import { parse } from "@/lib/server/validate";

// Adds many items in one go (a pasted list of links or titles). Each gets the platform and kind its link suggests;
// the title is the one you gave, else made from the link. One insert, so all are added or none.
export const POST = handle(async ({ db, body }) => {
  const input = parse(ResourceBulk, await body());
  const subject = await resolveSubject(db, { course_id: input.course_id });
  const rows = input.items.map((item) => {
    const link = item.url ? readLink(item.url) : { platform: "", kind: "other" as const };
    return {
      ...subject,
      kind: item.kind ?? input.kind ?? link.kind,
      title: item.title || titleFromLink(item.url),
      url: item.url,
      platform: item.platform || link.platform,
      est_hours: item.est_hours ?? 0,
      skills: item.skills ?? [],
    };
  });
  const items = must(await db.from("learning_resources").insert(rows).select());
  return { items };
}, { status: 201 });
