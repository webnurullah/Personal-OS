// Applications → Job Apply: read a job post from a link and pull out what matters with Claude.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { MODEL, fallback, aiError, anthropic } from "./ai.ts";
import { HttpError } from "./http.ts";
import { z } from "./validate.ts";

const MAX_BYTES = 3_000_000;
const MAX_TEXT = 40_000;

/** Private, loopback and link-local addresses: the server must never fetch those for a user. */
function isPrivate(ip: string) {
  if (isIP(ip) === 6) {
    const v6 = ip.toLowerCase();
    if (v6.startsWith("::ffff:")) return isPrivate(v6.slice(7));
    return v6 === "::1" || v6 === "::" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80");
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

async function checkHost(url: URL) {
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new HttpError(400, "Use a link starting with https://");
  const addresses = await lookup(url.hostname, { all: true }).catch(() => []);
  if (!addresses.length) throw new HttpError(400, "That website could not be found. Check the link.");
  if (addresses.some((a) => isPrivate(a.address))) throw new HttpError(400, "That link points to a private address.");
}

/** The readable text of a web page (job sites often hide the deadline in JSON-LD, so that is kept too). */
export async function readJobPage(link: string) {
  let url = new URL(link);
  let res: Response | undefined;
  // Follow up to 3 redirects by hand, checking every address.
  for (let hop = 0; hop < 4; hop++) {
    await checkHost(url);
    res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(12_000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; PersonalOS/1.0; job reader)", Accept: "text/html,application/xhtml+xml,text/plain" },
    }).catch(() => undefined);
    if (!res) throw new HttpError(422, "The website did not answer. Paste the job post text instead.");
    const next = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && next) {
      url = new URL(next, url);
      continue;
    }
    break;
  }
  if (!res?.ok) throw new HttpError(422, `The website refused to share the page (${res?.status}). Paste the job post text instead.`);
  if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) throw new HttpError(422, "That page is too big. Paste the job post text instead.");
  const html = (await res.text()).slice(0, MAX_BYTES);

  const jsonLd = [...html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1].trim()).join("\n");
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  const text = html
    .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr|section)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
  return `Page title: ${title.trim()}\n${jsonLd ? `Structured data:\n${jsonLd.slice(0, 8000)}\n` : ""}Page text:\n${text}`.slice(0, MAX_TEXT);
}

const JobInfo = z.object({
  is_job_post: z.boolean().describe("false when the text is not a job post (login page, error page, list of many jobs …)"),
  title: z.string().describe("Job title"),
  company: z.string().describe("Employer name, empty if unknown"),
  location: z.string().describe("City/country or Remote, empty if unknown"),
  deadline: z.string().nullable().describe("Last date to apply as YYYY-MM-DD, or null if the post gives none"),
  summary: z.string().describe("2-3 plain sentences: what the job is and who it suits"),
  requirements: z.array(z.string()).describe("The post's requirements and qualifications, one short line each (max 15)"),
  skills: z.array(z.string()).describe("Skills the job asks for as short canonical names, e.g. React, SQL, Communication, Project Management (max 20)"),
});
export type JobInfo = z.infer<typeof JobInfo>;

/** Asks Claude to read the post. `today` resolves dates like "apply within 10 days". */
export async function analyzeJob(post: string, today: string): Promise<JobInfo> {
  try {
    const response = await anthropic().beta.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      ...fallback(),
      output_config: { effort: "low", format: betaZodOutputFormat(JobInfo) },
      system: `You read job posts and pull out their details. Today is ${today}. Use only what the post says; do not invent a company, deadline or requirement. Write in English.`,
      messages: [{ role: "user", content: `<job_post>\n${post}\n</job_post>` }],
    });
    if (response.stop_reason === "refusal") throw new HttpError(422, "The AI could not read this post. Paste the job text instead.");
    const info = response.parsed_output;
    if (!info) throw new HttpError(502, "The AI's answer could not be read. Try again.");
    if (!info.is_job_post || !info.title.trim()) throw new HttpError(422, "That page does not look like one job post (it may need a login). Paste the job text instead.");
    const deadline = info.deadline && /^\d{4}-\d{2}-\d{2}$/.test(info.deadline) ? info.deadline : null;
    return {
      ...info,
      title: info.title.trim().slice(0, 200),
      company: info.company.trim().slice(0, 200),
      location: info.location.trim().slice(0, 200),
      deadline,
      summary: info.summary.trim().slice(0, 2000),
      requirements: info.requirements.map((r) => r.trim().slice(0, 500)).filter(Boolean).slice(0, 30),
      skills: [...new Set(info.skills.map((s) => s.trim().slice(0, 60)).filter(Boolean))].slice(0, 30),
    };
  } catch (error) {
    aiError(error);
  }
}
