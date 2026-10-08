// Learning library: read a course or playlist link to fill the form. Free: the platform comes from the address,
// YouTube answers with its public title lookup (oEmbed), other sites with the title of their page.
import { siteNameFromPage, titleFromPage } from "../job-extract.ts";
import { fixLink, readLink } from "../library.ts";
import type { ResourceRead } from "../types.ts";
import { fetchPage } from "./fetch-page.ts";
import { HttpError } from "./http.ts";

const clean = (text: string, max: number) => text.replace(/\s+/g, " ").trim().slice(0, max);

/** Page titles end with the site: "SEO Basics | Coursera", "Intro to SQL - YouTube". Cut that part off. */
export function tidyTitle(title: string, names: string[]) {
  const parts = title.split(/\s+[|\-–—]\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return title.trim();
  const last = parts[parts.length - 1].toLowerCase();
  const isSite = names.some((n) => n && (last === n.toLowerCase() || last.includes(n.toLowerCase()) || n.toLowerCase().includes(last)));
  return (isSite ? parts.slice(0, -1) : parts).join(" - ");
}

/** YouTube's public title lookup: the title and the channel of a video or playlist link. */
async function youtubeInfo(url: string) {
  const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(8_000) }).catch(() => undefined);
  if (!res?.ok) return null;
  const info = (await res.json().catch(() => null)) as { title?: unknown; author_name?: unknown } | null;
  return typeof info?.title === "string" && info.title.trim() ? { title: info.title, provider: typeof info.author_name === "string" ? info.author_name : "" } : null;
}

export async function readResource(rawUrl: string): Promise<ResourceRead> {
  const url = fixLink(rawUrl);
  try {
    if (!/^https?:$/.test(new URL(url).protocol)) throw new Error("not http");
  } catch {
    throw new HttpError(400, "Use a link starting with https://");
  }
  const { platform, kind } = readLink(url);
  const result: ResourceRead = { url, title: "", platform, provider: "", kind, found: false, note: "" };

  if (platform === "YouTube") {
    const video = await youtubeInfo(url);
    if (video) return { ...result, title: clean(video.title, 300), provider: clean(video.provider, 120), found: true };
  }

  try {
    const html = await fetchPage(url, { agent: "course reader" });
    const site = clean(siteNameFromPage(html), 60);
    const title = clean(tidyTitle(titleFromPage(html), [platform, site]), 300);
    if (title) {
      result.title = title;
      result.found = true;
      if (!result.provider && site && site.toLowerCase() !== platform.toLowerCase()) result.provider = site;
    }
  } catch (e) {
    // A link that is not allowed (private address, not found) is an error; a site that merely refuses is not.
    if (e instanceof HttpError && e.status === 400) throw e;
    result.note = e instanceof HttpError ? e.message : "The website did not answer.";
  }
  if (!result.title) result.note ||= "The title was not found. Type it in.";
  return result;
}
