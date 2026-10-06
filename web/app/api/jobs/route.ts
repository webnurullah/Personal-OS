import { handle } from "@/lib/server/api";
import { must } from "@/lib/server/http";
import { analyzeJob, readJobPage } from "@/lib/server/jobs";
import { JobAdd } from "@/lib/server/schemas";
import { parse } from "@/lib/server/validate";

// Reading the page and asking the AI can take a little while.
export const maxDuration = 60;

// Saved jobs, nearest last date to apply first (jobs without one at the end).
export const GET = handle(async ({ db, today }) => {
  const items = must(await db.from("job_applications").select("*").order("deadline", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }));
  return { today: await today(), items };
});

// Add a job from a link (or pasted text): the AI reads it and the job is saved.
export const POST = handle(async ({ db, body, today }) => {
  const { url, text } = parse(JobAdd, await body());
  const post = text?.trim() || (await readJobPage(url!));
  const info = await analyzeJob(post, await today());
  return must(
    await db.from("job_applications").insert({
      url: url ?? "",
      title: info.title,
      company: info.company,
      location: info.location,
      deadline: info.deadline,
      summary: info.summary,
      requirements: info.requirements,
      skills: info.skills,
    }).select().single(),
  );
}, { status: 201 });
