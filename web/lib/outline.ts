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
const LEADING = " |:-–—,";
const TRAILING = " |:-–—,.";
/** Collapses spaces and trims separators ("- ", "| ", ":") from both ends (a title may start with a dot: ".NET"). A loop, not a regex: a long run of separators in a pasted text must not take quadratic time. */
function tidy(s: string) {
  const text = s.replace(/\s+/g, " ");
  let from = 0;
  let to = text.length;
  while (from < to && LEADING.includes(text[from])) from += 1;
  while (to > from && TRAILING.includes(text[to - 1])) to -= 1;
  return text.slice(from, to);
}

const NUMBER = "(\\d+(?:[.,]\\d+)?)";
const SEP = "(?:^|[\\s|(:\\-–—,~≈])";
// "2h", "1.5 hours", "90 min", "(2h)", "| 2h", "- 2h", "~2h" at the very end of a line (with the separator in front of it).
const TRAILING_DURATION = new RegExp(`${SEP}${NUMBER}\\s*(hours?|hrs?|h|minutes?|mins?|m)\\s*\\)?\\.?\\s*$`, "i");
// "1h30m", "1h 30 min": hours and minutes written together.
const COMPOUND_DURATION = new RegExp(`${SEP}${NUMBER}\\s*h(?:ours?|rs?)?\\s*(\\d+)\\s*m(?:in(?:ute)?s?)?\\s*\\)?\\.?\\s*$`, "i");
// "2-3h", "(2–3 hours)": the longer is taken.
const RANGE_DURATION = new RegExp(`${SEP}${NUMBER}\\s*[-–]\\s*${NUMBER}\\s*(hours?|hrs?|h|minutes?|mins?|m)\\s*\\)?\\.?\\s*$`, "i");
// "| 2" (a bare number after a bar).
const TRAILING_BAR_NUMBER = /\|\s*(\d+(?:[.,]\d+)?)\s*$/;
// "Docker in 1 hour": after these words the number is part of the title, not the hours of the topic.
const TITLE_WORDS = /\b(?:in|for|about|of|takes?|within|under|over|around|approx\.?)$/i;

const num = (text: string) => Number(text.replace(",", "."));

/** Takes the hours off the end of a line: "Keyword research 1h 30m" → { text: "Keyword research", hours: 1.5 }. */
export function takeHours(line: string): { text: string; hours: number | null } {
  const text = line.trim();
  const found = (m: RegExpMatchArray, hours: number) => ({ text: tidy(text.slice(0, m.index)), hours });
  // The hours belong to the line only after a separator ("| 2h", "(2h)", "- 2h"): after plain spaces the number may be a
  // part of the title ("Docker in 1 hour").
  const afterWords = (m: RegExpMatchArray) => /^\s/.test(m[0]) && TITLE_WORDS.test(text.slice(0, m.index).trimEnd());

  const compound = text.match(COMPOUND_DURATION);
  if (compound && !afterWords(compound)) return found(compound, num(compound[1]) + Number(compound[2]) / 60);
  const range = text.match(RANGE_DURATION);
  if (range && !afterWords(range)) {
    const upper = Math.max(num(range[1]), num(range[2]));
    return found(range, /^m/i.test(range[3]) ? upper / 60 : upper);
  }
  const single = text.match(TRAILING_DURATION);
  if (single && !afterWords(single)) {
    const minutes = /^m/i.test(single[2]);
    let hours = minutes ? num(single[1]) / 60 : num(single[1]);
    let rest = text.slice(0, single.index).trimEnd();
    // "1h 30m": the minutes were taken first, the hours in front of them are added.
    if (minutes) {
      const before = rest.match(TRAILING_DURATION);
      if (before && !/^m/i.test(before[2]) && !afterWords(before)) {
        hours += num(before[1]);
        rest = rest.slice(0, before.index).trimEnd();
      }
    }
    return { text: tidy(rest), hours };
  }
  const bar = text.match(TRAILING_BAR_NUMBER);
  if (bar) return { text: tidy(text.slice(0, bar.index)), hours: num(bar[1]) };
  return { text: tidy(text), hours: null };
}

// A bullet, or a number with two levels ("1.2", "2.3.1"), or a letter ("a)"), or a single number ("3.") in front of the text.
const BULLET = /^(\s*)(?:[-*•·▪◦–]|\d+(?:\.\d+)+[.)]?|[a-z][.)]|\d+[.)])\s+(.*)$/i;
const SINGLE_NUMBER = /^(\s*)\d+[.)]\s+(.*)$/;
const TWO_LEVEL = /^\s*\d+(?:\.\d+)+[.)]?\s+/;
// "Unit 2: Ads", "Module III - Ads", "Chapter 4. Ads", "Part: Ads", "Unit - Ads". Not "Modules in Python", "Part of speech",
// "Part-time work", "Unit-testing", "Part I will teach" or "Module 1.1 Intro": those are ordinary titles.
const HEADING_WORD = /^(?:unit|module|chapter|section|part)(?:\s+(?:\d+(?![\d.]*\d)|[ivx]{1,6}(?=\s*[:.\-–—]|\s*$))\s*[:.\-–—]?|\s*:|\s+[-–—])\s*(.*)$/i;
const MARKDOWN_HEADING = /^#{1,6}\s*(.*)$/;

/** `explicit`: the line says it is a unit (a heading word, "#", a colon or a number); a plain line at the left edge only is one by position. */
type Line = { kind: "unit" | "topic"; text: string; explicit: boolean };

/** In a text with "Unit 1: …" style headings, numbered lines under them are topics; without such headings a single number is a unit. */
const hasWordHeadings = (raw: string[]) => raw.some((l) => HEADING_WORD.test(l.trim()) || MARKDOWN_HEADING.test(l.trim()));

function classify(raw: string, numbersAreTopics: boolean): Line | null {
  const line = raw.replace(/\t/g, "    ").trimEnd();
  if (!line.trim() || /^[\s\-_=*#]{3,}$/.test(line)) return null;
  const indent = line.length - line.trimStart().length;
  const trimmed = line.trim();

  const md = trimmed.match(MARKDOWN_HEADING);
  if (md) return { kind: "unit", text: md[1], explicit: true };

  const bullet = line.match(BULLET);
  if (bullet) {
    // A single number at the left edge ("2. Paid ads") is a unit; indented, or with two levels ("2.1"), it is a topic.
    const single = line.match(SINGLE_NUMBER);
    if (single && !TWO_LEVEL.test(line) && indent === 0 && !numbersAreTopics) return { kind: "unit", text: single[2], explicit: true };
    return { kind: "topic", text: bullet[2], explicit: true };
  }

  const word = trimmed.match(HEADING_WORD);
  if (word) return { kind: "unit", text: word[1] || trimmed, explicit: true };
  if (/:$/.test(trimmed)) return { kind: "unit", text: trimmed.slice(0, -1), explicit: true };
  // Indented text is a topic of the unit above; text at the left edge starts a unit.
  return indent >= 2 ? { kind: "topic", text: trimmed, explicit: true } : { kind: "unit", text: trimmed, explicit: false };
}

/**
 * Reads the outline. Limits: 30 units and 300 topics (the rest is left out, and the warnings say so).
 * Topics before the first unit go into a unit called `fallbackUnit`. A list in which every line is plain text at the left
 * edge (no bullets, no indents, no "Unit 1:" headings) is a flat list of topics: one unit called `fallbackUnit`.
 */
export function parseOutline(text: string, defaultHours = DEFAULT_TOPIC_HOURS, fallbackUnit = "Topics"): Outline {
  const hoursDefault = clampHours(defaultHours);
  const hoursOf = (taken: number | null) => (taken === null ? hoursDefault : clampHours(taken));
  const rawLines = text.slice(0, OUTLINE_LIMITS.text).split(/\r?\n/);
  const numbersAreTopics = hasWordHeadings(rawLines);
  let lines = rawLines.map((l) => classify(l, numbersAreTopics)).filter((l): l is Line => l !== null);
  // Nothing but plain lines: all of them are topics.
  if (lines.length > 1 && lines.every((l) => l.kind === "unit" && !l.explicit)) lines = lines.map((l) => ({ ...l, kind: "topic" as const }));

  const units: OutlineUnit[] = [];
  let topicCount = 0;
  let cutUnits = 0;
  let cutTopics = 0;
  let longTitles = 0;
  let skipping = false; // inside a unit that was left out

  for (const line of lines) {
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
      skipping = false;
      continue;
    }
    if (skipping || topicCount >= OUTLINE_LIMITS.topics) {
      cutTopics += 1;
      continue;
    }
    if (taken.text.length > OUTLINE_LIMITS.topicTitle) longTitles += 1;
    if (!units.length) units.push({ title: fallbackUnit, topics: [] });
    units.at(-1)!.topics.push({ title: taken.text.slice(0, OUTLINE_LIMITS.topicTitle), hours: hoursOf(taken.hours) });
    topicCount += 1;
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
