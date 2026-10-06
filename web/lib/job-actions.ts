// Saving a job from a link (browser side): read it, then save what was found.
import { api } from "./api";
import type { JobAnalysis, JobApplication } from "./types";

/** Adds "https://" when a link was typed without it. */
export function fixLink(link: string) {
  const text = link.trim();
  return text && !/^https?:\/\//i.test(text) && /^[\w-]+(\.[\w-]+)+/.test(text) ? `https://${text}` : text;
}

/** The fields of a form-ready job from an analysis. */
export const jobBody = (a: JobAnalysis, url: string, title = a.title) => ({
  url,
  title,
  company: a.company,
  location: a.location,
  deadline: a.deadline,
  summary: a.summary,
  requirements: a.requirements,
  skills: a.skills,
});

/** Reads a link and saves the job straight away (Quick Add: "job https://…"). */
export async function saveJobFromLink(link: string) {
  const url = fixLink(link);
  const analysis = await api<JobAnalysis>("/jobs/analyze", { method: "POST", body: { url } });
  let title = analysis.title;
  if (!title) {
    try {
      title = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      title = "New job";
    }
  }
  const job = await api<JobApplication>("/jobs", { method: "POST", body: jobBody(analysis, url, title) });
  return { job, analysis };
}
