// Applications → Job Apply: read a job post from a link. Rules read it for free (lib/job-extract.ts);
// when ANTHROPIC_API_KEY is set, Claude reads it instead and the rules are the safety net.
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { decodeEntities, extractJob, htmlToText, tidyJob, type JobInfo } from "../job-extract.ts";
import { MODEL, fallback, anthropic } from "./ai.ts";
import { fetchPage } from "./fetch-page.ts";
import { z } from "./validate.ts";

export type { JobInfo };

const MAX_TEXT = 40_000;

/** The HTML of a job page. */
export const fetchJobPage = (link: string) => fetchPage(link, { agent: "job reader", hint: " Paste the job post text instead." });

/** What Claude is shown: the page title, the page's job data, and the readable text. */
function textForAi(source: { html?: string; text?: string }) {
  if (source.text?.trim()) return source.text.trim().slice(0, MAX_TEXT);
  const html = source.html ?? "";
  const title = decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim();
  const jsonLd = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1].trim()).join("\n");
  return `Page title: ${title}\n${jsonLd ? `Structured data:\n${jsonLd.slice(0, 8000)}\n` : ""}Page text:\n${htmlToText(html)}`.slice(0, MAX_TEXT);
}

const AiJob = z.object({
  is_job_post: z.boolean().describe("false when the text is not a job post (login page, error page, list of many jobs …)"),
  title: z.string().describe("Job title"),
  company: z.string().describe("Employer name, empty if unknown"),
  location: z.string().describe("City/country or Remote, empty if unknown"),
  deadline: z.string().nullable().describe("Last date to apply as YYYY-MM-DD, or null if the post gives none"),
  summary: z.string().describe("2-3 plain sentences: what the job is and who it suits"),
  requirements: z.array(z.string()).describe("The post's requirements and qualifications, one short line each (max 15)"),
  skills: z.array(z.string()).describe("Skills the job asks for as short canonical names, e.g. React, SQL, Communication, Project Management (max 20)"),
});

/** Asks Claude to read the post. `today` resolves dates like "apply within 10 days". */
async function readWithAi(post: string, today: string): Promise<JobInfo> {
  const response = await anthropic().beta.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    ...fallback(),
    output_config: { effort: "low", format: betaZodOutputFormat(AiJob) },
    system: `You read job posts and pull out their details. Today is ${today}. Use only what the post says; do not invent a company, deadline or requirement. Write in English.`,
    messages: [{ role: "user", content: `<job_post>\n${post}\n</job_post>` }],
  });
  const info = response.parsed_output;
  if (response.stop_reason === "refusal" || !info || !info.is_job_post || !info.title.trim()) throw new Error("The AI found no job post");
  return tidyJob(info);
}

export type Analysis = JobInfo & { by: "ai" | "rules"; hints: string[] };

/** Reads a job post (page HTML or pasted text): with Claude when a key is set, otherwise by rules. */
export async function analyzeJob(source: { html?: string; text?: string }, today: string): Promise<Analysis> {
  let info: JobInfo | undefined;
  let by: Analysis["by"] = "ai";
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      info = await readWithAi(textForAi(source), today);
    } catch {
      info = undefined; // fall back to the rules
    }
  }
  if (!info) {
    by = "rules";
    info = extractJob(source, today);
  }

  const hints: string[] = [];
  if (!info.title) hints.push("The job title was not found: type it in.");
  if (!info.deadline) hints.push("No last date to apply was found: add it if the post has one.");
  if (!info.skills.length) hints.push("No known skills were found: add the skills the job asks for.");
  if (by === "rules") hints.push("Read by keyword rules, so please check the details.");
  return { ...info, by, hints };
}
