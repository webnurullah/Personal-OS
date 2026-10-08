import { handle } from "@/lib/server/api";
import { readResource } from "@/lib/server/resources";
import { ResourceReadInput } from "@/lib/server/schemas";
import { parse } from "@/lib/server/validate";

// Reading a page and YouTube's title lookup can take a little while.
export const maxDuration = 30;

// Reads a course, playlist or video link and answers with what it found. Nothing is saved: the form shows
// the answer so it can be checked and corrected before saving with POST /resources.
export const POST = handle(async ({ body }) => {
  const { url } = parse(ResourceReadInput, await body());
  return readResource(url);
});
