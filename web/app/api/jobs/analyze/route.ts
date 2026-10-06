import { handle } from "@/lib/server/api";
import { analyzeJob, fetchJobPage } from "@/lib/server/jobs";
import { JobAdd } from "@/lib/server/schemas";
import { parse } from "@/lib/server/validate";

// Reading the page (and the AI, when it is set up) can take a little while.
export const maxDuration = 60;

// Reads a job link or pasted post and answers with what it found. Nothing is saved: the form shows
// the answer so it can be checked and corrected before saving with POST /jobs.
export const POST = handle(async ({ body, today }) => {
  const { url, text } = parse(JobAdd, await body());
  const source = text?.trim() ? { text } : { html: await fetchJobPage(url!) };
  return analyzeJob(source, await today());
});
