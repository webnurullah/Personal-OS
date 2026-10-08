// Learning → Certificates & playlists: what is worked out from the items (never stored).
// Plain functions with no React, so both the pages and the tests use them.
import { daysBetween, formatDate } from "./dates.ts";
import { findSkills } from "./skills.ts";
import type { LearningResource, ResourceKind, ResourcePriority, ResourceStatus } from "./types.ts";

export const KINDS: { value: ResourceKind; label: string }[] = [
  { value: "certificate", label: "Certificate course" },
  { value: "playlist", label: "YouTube playlist" },
  { value: "video", label: "Video" },
  { value: "reading", label: "Article / book" },
  { value: "other", label: "Other" },
];

export const STATUSES: { value: ResourceStatus; label: string }[] = [
  { value: "todo", label: "To do" },
  { value: "learning", label: "Learning" },
  { value: "completed", label: "Completed" },
  { value: "dropped", label: "Dropped" },
];

export const PRIORITIES: { value: ResourcePriority; label: string }[] = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

/** "video" for a playlist, "lesson" for a course: what one step of progress is called. */
export const stepWord = (kind: string) => (kind === "playlist" || kind === "video" ? "video" : kind === "reading" ? "chapter" : "lesson");

export const kindLabel = (kind: string) => KINDS.find((k) => k.value === kind)?.label ?? "Other";
export const statusLabel = (status: string) => STATUSES.find((s) => s.value === status)?.label ?? status;

/** More than this many items in progress at once, and the page suggests finishing one first. */
export const WIP_LIMIT = 3;
/** A certificate counts as "expiring soon" this many days before its expiry date. */
export const EXPIRY_WARNING_DAYS = 30;

// ---------- Reading a link ----------

// Host (or the start of host/path) → platform name and the kind of thing it usually is. First match wins.
const PLATFORMS: { match: RegExp; name: string; kind: ResourceKind }[] = [
  { match: /(^|\.)coursera\.org$/, name: "Coursera", kind: "certificate" },
  { match: /(^|\.)udemy\.com$/, name: "Udemy", kind: "certificate" },
  { match: /(^|\.)edx\.org$/, name: "edX", kind: "certificate" },
  { match: /(^|\.)(skillshop\.withgoogle\.com|skillshop\.exceedlms\.com|learndigital\.withgoogle\.com|grow\.google|digitalgarage\.withgoogle\.com)$/, name: "Google", kind: "certificate" },
  { match: /(^|\.)academy\.hubspot\.com$/, name: "HubSpot Academy", kind: "certificate" },
  { match: /(^|\.)(facebookblueprint\.com|metablueprint\.com)$/, name: "Meta Blueprint", kind: "certificate" },
  { match: /(^|\.)linkedin\.com$/, name: "LinkedIn Learning", kind: "certificate" },
  { match: /(^|\.)futurelearn\.com$/, name: "FutureLearn", kind: "certificate" },
  { match: /(^|\.)skillshare\.com$/, name: "Skillshare", kind: "certificate" },
  { match: /(^|\.)alison\.com$/, name: "Alison", kind: "certificate" },
  { match: /(^|\.)semrush\.com$/, name: "Semrush Academy", kind: "certificate" },
  { match: /(^|\.)(ahrefs\.com)$/, name: "Ahrefs", kind: "certificate" },
  { match: /(^|\.)(moz\.com)$/, name: "Moz", kind: "reading" },
  { match: /(^|\.)khanacademy\.org$/, name: "Khan Academy", kind: "certificate" },
  { match: /(^|\.)freecodecamp\.org$/, name: "freeCodeCamp", kind: "certificate" },
  { match: /(^|\.)(w3schools\.com)$/, name: "W3Schools", kind: "certificate" },
  { match: /(^|\.)(datacamp\.com)$/, name: "DataCamp", kind: "certificate" },
  { match: /(^|\.)(github\.com)$/, name: "GitHub", kind: "other" },
  { match: /(^|\.)(medium\.com|dev\.to|substack\.com)$/, name: "Article", kind: "reading" },
];

/** Adds "https://" when a link was typed without it. */
export function fixLink(link: string) {
  const text = link.trim();
  return text && !/^https?:\/\//i.test(text) && /^[\w-]+(\.[\w-]+)+/.test(text) ? `https://${text}` : text;
}

function parseUrl(link: string) {
  try {
    return new URL(fixLink(link));
  } catch {
    return null;
  }
}

/** The platform a link is from, and what kind of thing it usually is: "youtube.com/playlist?list=…" → YouTube playlist. */
export function readLink(link: string): { platform: string; kind: ResourceKind } {
  const url = parseUrl(link);
  if (!url || !/^https?:$/.test(url.protocol)) return { platform: "", kind: "other" };
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host === "youtu.be" || /(^|\.)youtube\.com$/.test(host)) {
    const playlist = url.pathname.startsWith("/playlist") || (url.searchParams.has("list") && !url.searchParams.has("v"));
    return { platform: "YouTube", kind: playlist ? "playlist" : "video" };
  }
  const known = PLATFORMS.find((p) => p.match.test(host));
  if (known) return { platform: known.name, kind: known.kind };
  // Unknown site: its name without "www." and the ending ("learn.example.com" → "Example").
  const parts = host.split(".");
  const name = parts.length > 1 ? parts[parts.length - 2] : parts[0];
  return { platform: name ? name.charAt(0).toUpperCase() + name.slice(1) : "", kind: "other" };
}

// ---------- Progress and status ----------

/** How far along an item is: watched/total when it is counted, otherwise 100% once completed. */
export function progressOf(r: Pick<LearningResource, "status" | "items_total" | "items_done">) {
  if (r.status === "completed") return 100;
  if (r.items_total > 0) return Math.min(100, Math.round((r.items_done / r.items_total) * 100));
  return 0;
}

// What applyChange needs to know about an item as it is now (a database row fits as well as a LearningResource).
type Facts = { status: string; items_total: number; items_done: number; started_on: string | null; completed_on: string | null };
export type ResourceChange = Partial<Omit<LearningResource, "id" | "created_at">>;

/** What a new item starts as. */
export const NEW_FACTS: Facts = { status: "todo", items_total: 0, items_done: 0, started_on: null, completed_on: null };

/**
 * What to save when an item changes: the changes plus what follows from them, so the status, the counts and the dates
 * always agree. Watching the last video completes the item; completing it counts every video as watched; starting sets
 * the start date; leaving "completed" clears the finish date. Used for new items too (`current` = NEW_FACTS).
 */
export function applyChange(current: Facts, changes: ResourceChange, today: string): ResourceChange {
  const out: ResourceChange = { ...changes };
  const total = out.items_total ?? current.items_total;
  let done = out.items_done ?? current.items_done;
  done = total > 0 ? Math.min(done, total) : 0;

  let status: string = out.status ?? current.status;
  // Only the counts changed: the status follows the counts.
  if (out.status === undefined && total > 0 && (out.items_done !== undefined || out.items_total !== undefined)) {
    if (done >= total) status = "completed";
    else if (done > 0) status = "learning";
    else if (current.status === "completed") status = "todo";
  }
  if (status === "completed" && total > 0) done = total;

  // Dates follow a change of status (an edit of the title alone never touches them).
  if (status !== current.status) {
    if (status === "learning") out.started_on = out.started_on ?? current.started_on ?? today;
    if (status === "completed") {
      out.completed_on = out.completed_on ?? current.completed_on ?? today;
      out.started_on = out.started_on ?? current.started_on ?? out.completed_on;
    }
    if (current.status === "completed" && out.completed_on === undefined) out.completed_on = null;
  }

  out.status = status as ResourceStatus;
  out.items_done = done;
  return out;
}

/** Why a certificate's dates cannot be right (null when they are fine). */
export function certificateDatesProblem(issued: string | null | undefined, expires: string | null | undefined) {
  return issued && expires && expires < issued ? "The expiry date cannot be before the date the certificate was issued." : null;
}

// ---------- Certificates ----------

/** A completed item with a certificate link or ID counts as a certificate earned. */
export const hasCertificate = (r: Pick<LearningResource, "status" | "certificate_url" | "certificate_id">) =>
  r.status === "completed" && Boolean(r.certificate_url.trim() || r.certificate_id.trim());

/** Where a certificate stands today: no expiry date, valid, expiring within 30 days, or expired. */
export function certificateExpiry(r: Pick<LearningResource, "expires_on">, today: string) {
  if (!r.expires_on) return { state: "none" as const, days: null };
  const days = daysBetween(today, r.expires_on);
  return { state: days < 0 ? ("expired" as const) : days <= EXPIRY_WARNING_DAYS ? ("soon" as const) : ("valid" as const), days };
}

/** "Expires in 12 days", "Expired 3 days ago", "Valid until Oct 2027" (empty when there is no expiry date). */
export function expiryLabel(r: Pick<LearningResource, "expires_on">, today: string) {
  const { state, days } = certificateExpiry(r, today);
  if (state === "none" || days === null) return "";
  if (state === "expired") return days === -1 ? "Expired yesterday" : `Expired ${-days} days ago`;
  if (state === "soon") return days === 0 ? "Expires today" : days === 1 ? "Expires tomorrow" : `Expires in ${days} days`;
  return `Valid until ${formatDate(r.expires_on!, "monthShort")}`;
}

// ---------- The whole library ----------

/** The numbers at the top of the page. `hours` counts completed items fully and started ones by how much is watched. */
export function libraryStats(list: LearningResource[]) {
  const by = (status: ResourceStatus) => list.filter((r) => r.status === status);
  const completed = by("completed");
  const learning = by("learning");
  const hours = completed.reduce((sum, r) => sum + Number(r.est_hours), 0) + learning.reduce((sum, r) => sum + (Number(r.est_hours) * progressOf(r)) / 100, 0);
  return {
    todo: by("todo").length,
    learning: learning.length,
    completed: completed.length,
    dropped: by("dropped").length,
    certificates: completed.filter(hasCertificate).length,
    hours: Math.round(hours * 100) / 100,
    spent: Math.round(list.filter((r) => r.status !== "dropped").reduce((sum, r) => sum + Number(r.cost), 0) * 100) / 100,
    /** True when more than WIP_LIMIT are in progress at once. */
    tooManyStarted: learning.length > WIP_LIMIT,
  };
}

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

/** Order for "Up next": what you already started, then the nearest deadline, then priority, then the oldest added. */
export function compareUpNext(a: LearningResource, b: LearningResource) {
  const started = Number(b.status === "learning") - Number(a.status === "learning");
  if (started) return started;
  if (a.due_date !== b.due_date) {
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date < b.due_date ? -1 : 1;
  }
  const priority = (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1);
  return priority || a.created_at.localeCompare(b.created_at);
}

/** The next few things to work on: items still to do or in progress, best first. */
export const upNext = (list: LearningResource[], limit = 3) =>
  list.filter((r) => r.status === "todo" || r.status === "learning").sort(compareUpNext).slice(0, limit);

/** The items of one subject (a course), or the ones with none (`null`). */
export const ofCourse = (list: LearningResource[], courseId: string | null) => list.filter((r) => r.course_id === courseId);

/** "3 of 8 completed · 21 h" for a subject. */
export function courseRollup(list: LearningResource[]) {
  const live = list.filter((r) => r.status !== "dropped");
  const done = live.filter((r) => r.status === "completed");
  return { total: live.length, completed: done.length, hours: Math.round(done.reduce((sum, r) => sum + Number(r.est_hours), 0) * 100) / 100 };
}

// ---------- After completing: what it can do for you ----------

/** Skills to offer after finishing an item: the ones it lists, else the known skills its title and notes mention. */
export function suggestSkills(r: Pick<LearningResource, "title" | "skills" | "notes">) {
  return r.skills.length ? r.skills : findSkills(`${r.title}\n${r.notes}`, 8);
}

/** A line for a CV or LinkedIn: "Completed SEO Basics (Coursera, Oct 2026) — skills: SEO, Google Analytics — certificate ID ABC123". */
export function resumeLine(r: Pick<LearningResource, "title" | "platform" | "provider" | "completed_on" | "issued_on" | "skills" | "certificate_id">) {
  const when = r.issued_on || r.completed_on;
  const where = [r.platform || r.provider, when ? formatDate(when, "monthShort") : ""].filter(Boolean).join(", ");
  return [
    `Completed ${r.title}${where ? ` (${where})` : ""}`,
    r.skills.length ? `skills: ${r.skills.join(", ")}` : "",
    r.certificate_id.trim() ? `certificate ID ${r.certificate_id.trim()}` : "",
  ]
    .filter(Boolean)
    .join(" — ");
}

/** A readable title made from a link, for when the page cannot be read: "…/seo-basics-course" → "Seo Basics Course", else the site name. */
export function titleFromLink(link: string) {
  const url = parseUrl(link);
  if (!url) return link.slice(0, 300);
  let path = url.pathname;
  try {
    path = decodeURIComponent(path);
  } catch {
    // a broken %-sequence: use the path as it is
  }
  const slug = path.split("/").filter(Boolean).pop() ?? "";
  const words = slug.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[-_+]+/g, " ").trim();
  if (words.length >= 3 && !/^\d+$/.test(words) && !/^(playlist|watch|learn|course|courses)$/i.test(words)) return words.replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 300);
  return url.hostname.replace(/^www\./, "");
}

/** Lines pasted in one go: "https://…" or "Title | https://…" or just "Title". Empty lines are ignored. */
export function parseList(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("|").map((p) => p.trim());
      const link = parts.find((p) => /^(https?:\/\/|www\.)/i.test(p)) ?? "";
      const title = parts.find((p) => p && p !== link) ?? "";
      return { title: title.slice(0, 300), url: link ? fixLink(link) : "" };
    })
    .filter((item) => item.title || item.url);
}
