// Learning → "Paste an outline": turns a pasted list of units and topics into rows, by rules (no AI), e.g.
//   Unit 1: SEO basics                 SEO basics:               ## SEO basics
//   - What is SEO | 1h                 - Keyword research (2.5h) * On-page SEO 90m
//   1.3 Link building 2h               Keyword research 1h 30m
// A line with a bullet, a two-level number ("1.2 …") or an indent is a topic; any other line starts a new unit.
// Hours at the end of a topic line are read ("2h", "1.5 hours", "90m", "1h 30m", "| 2"); without them a topic gets the default.
import { nextNumber, nextPosition } from "./course.ts";

export type OutlineTopic = { title: string; hours: number };
export type OutlineUnit = { title: string; topics: OutlineTopic[] };
export type Outline = { units: OutlineUnit[]; topicCount: number; hours: number; warnings: string[] };

export const OUTLINE_LIMITS = { units: 30, topics: 300, text: 30_000, unitTitle: 200, topicTitle: 300 } as const;
export const DEFAULT_TOPIC_HOURS = 2;
const MIN_HOURS = 0.25;
const MAX_HOURS = 500;

const round4th = (n: number) => Math.round(n * 4) / 4;
const clampHours = (n: number) => Math.min(MAX_HOURS, Math.max(MIN_HOURS, round4th(n)));
const SEPARATORS = " |:-–—,.";
/** Collapses spaces and trims separators ("- ", "| ", ":") from both ends. A loop, not a regex: a long run of separators in a pasted text must not take quadratic time. */
function tidy(s: string) {
  const text = s.replace(/\s+/g, " ");
  let from = 0;
  let to = text.length;
  while (from < to && SEPARATORS.includes(text[from])) from += 1;
  while (to > from && SEPARATORS.includes(text[to - 1])) to -= 1;
  return text.slice(from, to);
}

// "2h", "1.5 hours", "90 min", "(2h)", "| 2h", "- 2h" at the very end of a line (with the separator in front of it).
const TRAILING_DURATION = /(?:^|[\s|(:\-–—,])(\d+(?:[.,]\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)\s*\)?\.?\s*$/i;
// "| 2" (a bare number after a bar).
const TRAILING_BAR_NUMBER = /\|\s*(\d+(?:[.,]\d+)?)\s*$/;

/** Takes the hours off the end of a line: "Keyword research 1h 30m" → { text: "Keyword research", hours: 1.5 }. */
export function takeHours(line: string): { text: string; hours: number | null } {
  let text = line.trim();
  let hours: number | null = null;
  // Up to two parts, but only "…h 30m": minutes first, then the hours in front of them.
  for (let i = 0; i < 2; i++) {
    const m = text.match(TRAILING_DURATION);
    if (!m) break;
    const minutes = /^m/i.test(m[2]);
    hours = (hours ?? 0) + (minutes ? Number(m[1].replace(",", ".")) / 60 : Number(m[1].replace(",", ".")));
    text = text.slice(0, m.index).trimEnd();
    if (!minutes) break;
  }
  if (hours === null) {
    const bar = text.match(TRAILING_BAR_NUMBER);
    if (bar) {
      hours = Number(bar[1].replace(",", "."));
      text = text.slice(0, bar.index).trimEnd();
    }
  }
  return { text: tidy(text), hours };
}

// A bullet, or a number with two levels ("1.2", "2.3.1"), or a letter ("a)"), or a single number ("3.") in front of the text.
const BULLET = /^(\s*)(?:[-*•·▪◦–]|\d+(?:\.\d+)+[.)]?|[a-z][.)]|\d+[.)])\s+(.*)$/i;
const SINGLE_NUMBER = /^(\s*)\d+[.)]\s+(.*)$/;
const TWO_LEVEL = /^\s*\d+(?:\.\d+)+[.)]?\s+/;
// "Unit 2: Ads", "Module III - Ads", "Chapter 4. Ads", "Part: Ads"; a plain word like "Modules in Python" is not a heading prefix.
const HEADING_WORD = /^(?:unit|module|chapter|section|part)\s*(?:(?:\d+|[ivx]+)\b\s*[:.\-–—]?|[:\-–—])\s*(.*)$/i;
const MARKDOWN_HEADING = /^#{1,6}\s*(.*)$/;

type Line = { kind: "unit" | "topic"; text: string };

function classify(raw: string): Line | null {
  const line = raw.replace(/\t/g, "    ").trimEnd();
  if (!line.trim() || /^[\s\-_=*#]{3,}$/.test(line)) return null;
  const indent = line.length - line.trimStart().length;
  const trimmed = line.trim();

  const md = trimmed.match(MARKDOWN_HEADING);
  if (md) return { kind: "unit", text: md[1] };

  const bullet = line.match(BULLET);
  if (bullet) {
    // A single number at the left edge ("2. Paid ads") is a unit; indented, or with two levels ("2.1"), it is a topic.
    const single = line.match(SINGLE_NUMBER);
    if (single && !TWO_LEVEL.test(line) && indent === 0) return { kind: "unit", text: single[2] };
    return { kind: "topic", text: bullet[2] };
  }

  const word = trimmed.match(HEADING_WORD);
  if (word) return { kind: "unit", text: word[1] || trimmed };
  if (/:$/.test(trimmed)) return { kind: "unit", text: trimmed.slice(0, -1) };
  // Indented text is a topic of the unit above; text at the left edge starts a unit.
  return { kind: indent >= 2 ? "topic" : "unit", text: trimmed };
}

/**
 * Reads the outline. Limits: 30 units and 300 topics (the rest is left out, and the warnings say so).
 * Topics before the first unit go into a unit called `fallbackUnit`; a list in which every line is a one-line "unit"
 * (no bullets, no indents) is a flat list of topics and becomes one unit called `fallbackUnit` too.
 */
export function parseOutline(text: string, defaultHours = DEFAULT_TOPIC_HOURS, fallbackUnit = "Topics"): Outline {
  const hoursDefault = clampHours(defaultHours);
  const hoursOf = (taken: number | null) => (taken === null ? hoursDefault : clampHours(taken));
  const units: OutlineUnit[] = [];
  const hints: (number | null)[] = []; // hours written at the end of a unit line (used only when the list turns out to be flat)
  let topicCount = 0;
  let cutUnits = 0;
  let cutTopics = 0;
  let longTitles = 0;
  let skipping = false; // inside a unit that was left out

  for (const line of text.slice(0, OUTLINE_LIMITS.text).split(/\r?\n/).map(classify)) {
    if (!line) continue;
    const taken = takeHours(line.text);
    if (!taken.text) continue;
    if (line.kind === "unit") {
      if (units.length >= OUTLINE_LIMITS.units) {
        cutUnits += 1;
        skipping = true;
        continue;
      }
      if (taken.text.length > OUTLINE_LIMITS.unitTitle) longTitles += 1;
      units.push({ title: taken.text.slice(0, OUTLINE_LIMITS.unitTitle), topics: [] });
      hints.push(taken.hours);
      continue;
    }
    if (skipping || topicCount >= OUTLINE_LIMITS.topics) {
      cutTopics += 1;
      continue;
    }
    if (taken.text.length > OUTLINE_LIMITS.topicTitle) longTitles += 1;
    if (!units.length) {
      units.push({ title: fallbackUnit, topics: [] });
      hints.push(null);
    }
    units.at(-1)!.topics.push({ title: taken.text.slice(0, OUTLINE_LIMITS.topicTitle), hours: hoursOf(taken.hours) });
    topicCount += 1;
  }

  // Only one-line units: it was a flat list of topics.
  if (!cutUnits && units.length > 1 && units.every((u) => u.topics.length === 0)) {
    const topics = units.slice(0, OUTLINE_LIMITS.topics).map((u, i) => ({ title: u.title, hours: hoursOf(hints[i]) }));
    cutTopics += units.length - topics.length;
    units.splice(0, units.length, { title: fallbackUnit, topics });
    topicCount = topics.length;
  }

  const warnings: string[] = [];
  if (cutUnits) warnings.push(`Only the first ${OUTLINE_LIMITS.units} units were read (${cutUnits} more left out).`);
  if (cutTopics) warnings.push(`Only the first ${OUTLINE_LIMITS.topics} topics were read, or the topics of units that were left out (${cutTopics} left out).`);
  if (longTitles) warnings.push(`${longTitles} long ${longTitles === 1 ? "title was" : "titles were"} shortened.`);
  if (text.length > OUTLINE_LIMITS.text) warnings.push("The text was cut after 30,000 letters.");

  const hours = units.reduce((sum, u) => sum + u.topics.reduce((s, t) => s + t.hours, 0), 0);
  return { units, topicCount, hours, warnings };
}

export const UNIT_COLORS = ["blue", "emerald", "violet", "amber", "rose", "teal", "indigo", "orange"] as const;

export type NumberedTopic = { code: string; title: string; est_hours: number; position: number };
export type NumberedUnit = { code: string; title: string; color: string; position: number; topics: NumberedTopic[] };

/**
 * Gives the parsed units their numbers for adding to a course that already has `existing` units:
 * unit codes continue after the highest one in use ("1", "2" → "3"), topic codes follow their unit ("3.1", "3.2"),
 * and the new units go after the last position.
 */
export function numberOutline(outline: Outline, existing: { codes: string[]; positions: number[] } = { codes: [], positions: [] }): NumberedUnit[] {
  const firstCode = nextNumber(existing.codes);
  const firstPosition = nextPosition(existing.positions);
  return outline.units.map((unit, i) => {
    const code = String(firstCode + i);
    return {
      code,
      title: unit.title,
      color: UNIT_COLORS[(firstPosition + i) % UNIT_COLORS.length],
      position: firstPosition + i,
      topics: unit.topics.map((topic, j) => ({ code: `${code}.${j + 1}`, title: topic.title, est_hours: topic.hours, position: j })),
    };
  });
}
