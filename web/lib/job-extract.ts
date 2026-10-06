// Reads a job post without AI: the page's job data (JobPosting) when the site has it, plus
// keyword rules for the deadline, requirements and skills. Less smart than AI, free, and every
// field can be corrected by hand afterwards. Runs on the server (pages) and in tests.
import { extractDate } from "./parse-date.ts";
import { findSkills } from "./skills.ts";

export type JobInfo = {
  title: string;
  company: string;
  location: string;
  /** Last date to apply, YYYY-MM-DD. */
  deadline: string | null;
  summary: string;
  requirements: string[];
  skills: string[];
};

const NAMED: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", ndash: "–", mdash: "—", bull: "•", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…" };

export function decodeEntities(text: string) {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : " ";
    }
    return NAMED[code.toLowerCase()] ?? whole;
  });
}

/** The readable text of a web page, one block per line. */
export function htmlToText(html: string) {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|head|nav|footer|form|iframe)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<li\b[^>]*>/gi, "\n• ")
      .replace(/<br\s*\/?>|<\/(p|div|li|ul|ol|h[1-6]|tr|section|article|table|dt|dd)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

type Json = Record<string, unknown>;

/** The page's own job data (schema.org JobPosting), which many job sites include for Google. */
function jobPosting(html: string): Json | null {
  for (const block of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: unknown;
    try {
      data = JSON.parse(block[1].trim());
    } catch {
      continue;
    }
    const queue: unknown[] = [data];
    while (queue.length) {
      const node = queue.shift();
      if (Array.isArray(node)) queue.push(...node);
      else if (node && typeof node === "object") {
        const obj = node as Json;
        const type = obj["@type"];
        if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) return obj;
        if (obj["@graph"]) queue.push(obj["@graph"]);
      }
    }
  }
  return null;
}

const str = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const nameOf = (value: unknown): string => (Array.isArray(value) ? nameOf(value[0]) : value && typeof value === "object" ? str((value as Json).name) : str(value));

function postingLocation(job: Json) {
  const place = Array.isArray(job.jobLocation) ? job.jobLocation[0] : job.jobLocation;
  const address = place && typeof place === "object" ? ((place as Json).address as Json | string | undefined) : undefined;
  const parts =
    typeof address === "string" ? [address] : address ? [str(address.addressLocality), str(address.addressRegion), nameOf(address.addressCountry)] : [];
  const where = [...new Set(parts.filter(Boolean))].join(", ");
  const remote = str(job.jobLocationType).toUpperCase() === "TELECOMMUTE";
  return remote ? (where ? `Remote · ${where}` : "Remote") : where;
}

const HEADING = /^(?:(?:key|main|job|additional|other|minimum|educational|academic|experience|skills?)\s+)*(?:requirements?|qualifications?|skills?(?:\s*(?:&|and)\s*(?:requirements?|experience|qualifications?))?|what\s+(?:we(?:'|’)?re\s+looking\s+for|you(?:'|’)?ll\s+need|you\s+(?:will\s+)?need|you\s+bring)|who\s+you\s+are|experience|education)\s*[:\-–]?$/i;
const STOP = /^(?:application|deadline|last\s+date|salary|published|posted|apply|benefits?|responsibilit|duties|compensation|salary|how\s+to\s+apply|apply\s+procedure|about\s+(?:us|the\s+company)|job\s+description|employment\s+status|workplace|job\s+context|vacanc|nature\s+of|what\s+we\s+offer|why\s+join|company\s+information|other\s+benefits|perks)/i;
const REQUIREMENT_HINT = /\b(years?\s+of\s+experience|degree|bachelor|master|diploma|b\.?sc|m\.?sc|hsc|ssc|proficien|knowledge\s+of|ability\s+to|experience\s+(?:in|with)|familiar(?:ity)?\s+with|must\s+have|should\s+have)\b/i;

function requirementsFrom(lines: string[]) {
  const found: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const head = lines[i].replace(/^[•\-*\d.)\s]+/, "").trim();
    if (head.length > 60 || !HEADING.test(head)) continue;
    for (let j = i + 1, taken = 0; j < lines.length && taken < 12; j++) {
      const raw = lines[j].replace(/^[•\-*–]+\s*/, "").trim();
      if (raw.length < 60 && (STOP.test(raw) || (HEADING.test(raw) && j > i + 1))) break;
      if (raw.length < 6 || raw.length > 300) continue;
      found.push(raw);
      taken++;
    }
  }
  if (!found.length) {
    // No heading: keep the lines that sound like requirements.
    for (const line of lines) {
      const raw = line.replace(/^[•\-*–]+\s*/, "").trim();
      if (raw.length >= 15 && raw.length <= 250 && REQUIREMENT_HINT.test(raw)) found.push(raw);
      if (found.length >= 8) break;
    }
  }
  return [...new Set(found)].slice(0, 15);
}

const DEADLINE = /(?:application\s+deadline|deadline|last\s+date(?:\s+(?:to|of|for)\s+(?:apply(?:ing)?|application|submission))?|apply\s+(?:before|by)|closing\s+date|closes?(?:\s+on)?|expires?(?:\s+on)?|valid\s+(?:till|until|through))\s*[:\-–]?\s*([^\n]{0,60})/gi;

function deadlineFrom(text: string, today: string) {
  for (const m of text.matchAll(DEADLINE)) {
    const date = extractDate(m[1], today);
    if (date) return date.value;
  }
  return null;
}

function firstSentences(text: string, max = 280) {
  const paragraph = text.split("\n").find((l) => l.length >= 60 && !l.startsWith("•") && !/^(?:requirements?|qualifications?)/i.test(l)) ?? "";
  if (paragraph.length <= max) return paragraph;
  const cutAt = paragraph.lastIndexOf(". ", max);
  return cutAt > 80 ? paragraph.slice(0, cutAt + 1) : `${paragraph.slice(0, max - 1).trimEnd()}…`;
}

function titleFromPage(html: string) {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)?.[1];
  const raw = decodeEntities(og ?? html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim();
  return raw;
}

/** Cuts "Frontend Developer - Acme | BDJobs" down to the job title (and the company if it is there). */
function splitTitle(raw: string) {
  const at = raw.match(/^(.{4,120}?)\s+(?:at|@)\s+(.{2,80}?)(?:\s*[|\-–—].*)?$/i);
  if (at) return { title: at[1].trim(), company: at[2].trim() };
  const parts = raw.split(/\s+[|\-–—]\s+/).map((p) => p.trim()).filter(Boolean);
  return { title: parts[0] ?? raw, company: "" };
}

const clip = (text: string, max: number) => text.trim().slice(0, max);

/** Keeps every field inside what the database accepts. */
export function tidyJob(info: JobInfo): JobInfo {
  return {
    title: clip(info.title, 200),
    company: clip(info.company, 200),
    location: clip(info.location, 200),
    deadline: info.deadline && /^\d{4}-\d{2}-\d{2}$/.test(info.deadline) ? info.deadline : null,
    summary: clip(info.summary, 2000),
    requirements: info.requirements.map((r) => clip(r, 500)).filter(Boolean).slice(0, 30),
    skills: [...new Set(info.skills.map((s) => clip(s, 60)).filter(Boolean))].slice(0, 30),
  };
}

/**
 * Reads a job from a web page (`html`) or from pasted text. Anything it cannot find is left empty,
 * so the form can ask you to fill it in.
 */
export function extractJob(source: { html?: string; text?: string }, today: string): JobInfo {
  const html = source.html ?? "";
  const posting = html ? jobPosting(html) : null;

  const description = posting && str(posting.description) ? htmlToText(/&lt;\w+/.test(str(posting.description)) ? decodeEntities(str(posting.description)) : str(posting.description)) : "";
  const pageText = html ? htmlToText(html) : "";
  const text = source.text?.trim() || [description, pageText].filter(Boolean).join("\n") || "";
  const body = description || text;
  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);

  let title = str(posting?.title);
  let company = nameOf(posting?.hiringOrganization);
  let location = posting ? postingLocation(posting) : "";

  if (!title && html) {
    const split = splitTitle(titleFromPage(html));
    title = split.title;
    company ||= split.company;
  }
  if (!company && html) company = decodeEntities(html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? "").trim();
  if (!title && source.text) {
    title = lines.map((l) => l.match(/^(?:job\s*title|position|vacancy|post)\s*[:\-–]\s*(.{3,150})$/i)?.[1]).find(Boolean) ?? (lines[0] && lines[0].length <= 120 ? lines[0] : "");
  }
  company ||= lines.map((l) => l.match(/^(?:company(?:\s+name)?|employer|organi[sz]ation)\s*[:\-–]\s*(.{2,100})$/i)?.[1]).find(Boolean) ?? "";
  location ||= lines.map((l) => l.match(/^(?:job\s+location|work\s+location|location|workplace)\s*[:\-–]\s*(.{2,100})$/i)?.[1]).find(Boolean) ?? "";

  const posted = str(posting?.validThrough).match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
  const deadline = posted ?? deadlineFrom(text || body, today);

  return tidyJob({
    title,
    company,
    location,
    deadline,
    summary: firstSentences(body),
    requirements: requirementsFrom(lines),
    skills: findSkills(body || text),
  });
}
