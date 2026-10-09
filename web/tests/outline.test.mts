// Learning → paste an outline: the reader and the numbering. Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_TOPIC_HOURS, numberOutline, OUTLINE_LIMITS, parseOutline, takeHours } from "../lib/outline.ts";

const shape = (text: string) => parseOutline(text).units.map((u) => [u.title, u.topics.map((t) => [t.title, t.hours])]);

test("hours are read from the end of a line in the usual ways", () => {
  const cases: [string, string, number | null][] = [
    ["Keyword research 2h", "Keyword research", 2],
    ["Keyword research (2.5h)", "Keyword research", 2.5],
    ["Keyword research - 3 hours", "Keyword research", 3],
    ["Keyword research | 2", "Keyword research", 2],
    ["Keyword research | 2h", "Keyword research", 2],
    ["Keyword research 90m", "Keyword research", 1.5],
    ["Keyword research 90 min", "Keyword research", 1.5],
    ["Keyword research 1h 30m", "Keyword research", 1.5],
    ["Keyword research: 1,5 hrs", "Keyword research", 1.5],
    ["Keyword research, 2 hours.", "Keyword research", 2],
    ["SEO 101", "SEO 101", null],
    ["Windows 10", "Windows 10", null],
    ["Excel", "Excel", null],
  ];
  for (const [line, title, hours] of cases) assert.deepEqual(takeHours(line), { text: title, hours }, line);
  assert.deepEqual(takeHours("2h"), { text: "", hours: 2 });
});

test("units with bullets and hours", () => {
  assert.deepEqual(shape(`Unit 1: SEO basics
- What is SEO | 1h
- Keyword research (2.5h)
* On-page SEO 90m
Unit 2: Paid ads
- Google Ads 3 hours
- Meta Ads`), [
    ["SEO basics", [["What is SEO", 1], ["Keyword research", 2.5], ["On-page SEO", 1.5]]],
    ["Paid ads", [["Google Ads", 3], ["Meta Ads", DEFAULT_TOPIC_HOURS]]],
  ]);
});

test("numbers: a single number is a unit, two levels are topics", () => {
  assert.deepEqual(shape(`1. SEO
1.1 Keywords 2h
1.2) Links 1h 30m
2. Ads
2.1. Google Ads | 3`), [
    ["SEO", [["Keywords", 2], ["Links", 1.5]]],
    ["Ads", [["Google Ads", 3]]],
  ]);
});

test("markdown headings, colons and words like Module and Chapter are units", () => {
  assert.deepEqual(shape(`## Basics
- A 1h
Module 2: Advanced
- B 1h
Chapter III - Projects
- C 1h
Tools:
- D 1h`), [
    ["Basics", [["A", 1]]], ["Advanced", [["B", 1]]], ["Projects", [["C", 1]]], ["Tools", [["D", 1]]],
  ]);
});

test("ordinary words that start like a heading word stay as they are", () => {
  const out = parseOutline("Modules in Python\n- Imports 1h\nPart of speech\n- Nouns 1h\nSection: Wrap-up\n- Review 1h");
  assert.deepEqual(out.units.map((u) => u.title), ["Modules in Python", "Part of speech", "Wrap-up"]);
});

test("indented lines are topics of the unit above, with or without a bullet", () => {
  assert.deepEqual(shape(`Basics
  What is it 1h
    How it works 2h
\tTools 0.5h
Next unit
  Topic`), [
    ["Basics", [["What is it", 1], ["How it works", 2], ["Tools", 0.5]]],
    ["Next unit", [["Topic", 2]]],
  ]);
});

test("a flat list of lines is one unit of topics", () => {
  assert.deepEqual(shape("Intro 1h\nKeywords\nLinks 30m"), [["Topics", [["Intro", 1], ["Keywords", 2], ["Links", 0.5]]]]);
  assert.deepEqual(shape("- A\n- B"), [["Topics", [["A", 2], ["B", 2]]]], "topics before any unit go to one called Topics");
  assert.deepEqual(parseOutline("Intro\nKeywords", 3, "Lessons").units.map((u) => [u.title, u.topics.map((t) => t.hours)]), [["Lessons", [3, 3]]]);
  // One unit with nothing in it stays a unit.
  assert.deepEqual(shape("Final project"), [["Final project", []]]);
});

test("a topic's hours are rounded to a quarter and kept between 15 minutes and 500 hours", () => {
  const out = parseOutline("U\n- tiny 0.1h\n- odd 1.1h\n- huge 1000h\n- default");
  assert.deepEqual(out.units[0].topics.map((t) => t.hours), [0.25, 1, 500, 2]);
  assert.equal(parseOutline("U\n- a", 0.01).units[0].topics[0].hours, 0.25);
  assert.equal(parseOutline("U\n- a", 9999).units[0].topics[0].hours, 500);
});

test("blank lines, rules, Windows line endings and tabs do not matter; the totals add up", () => {
  const out = parseOutline("\r\nUnit A\r\n\r\n- one 1h\r\n---\r\n- two 2h\r\n\r\n");
  assert.deepEqual(out.units.map((u) => u.topics.length), [2]);
  assert.equal(out.topicCount, 2);
  assert.equal(out.hours, 3);
  assert.deepEqual(out.warnings, []);
  assert.deepEqual(parseOutline("").units, []);
  assert.deepEqual(parseOutline("   \n\n").units, []);
});

test("limits: 30 units and 300 topics, and what was left out is said", () => {
  const manyUnits = Array.from({ length: 33 }, (_, i) => `Unit ${i + 1}: U${i + 1}\n- a 1h`).join("\n");
  const u = parseOutline(manyUnits);
  assert.equal(u.units.length, OUTLINE_LIMITS.units);
  assert.equal(u.units.at(-1)!.topics.length, 1, "the topics of a unit that was left out are not added to the last unit");
  assert.equal(u.warnings.length, 2);
  assert.match(u.warnings[0], /first 30 units/);

  const manyTopics = "U\n" + Array.from({ length: 310 }, (_, i) => `- t${i} 1h`).join("\n");
  const t = parseOutline(manyTopics);
  assert.equal(t.topicCount, OUTLINE_LIMITS.topics);
  assert.match(t.warnings[0], /first 300 topics/);
});

test("very long titles are shortened and said so", () => {
  const out = parseOutline(`${"U".repeat(250)}\n- ${"t".repeat(400)} 1h`);
  assert.equal(out.units[0].title.length, OUTLINE_LIMITS.unitTitle);
  assert.equal(out.units[0].topics[0].title.length, OUTLINE_LIMITS.topicTitle);
  assert.match(out.warnings[0], /2 long titles were shortened/);
});

test("numbering continues after the units a course already has", () => {
  const outline = parseOutline("A\n- a1 1h\n- a2 2h\nB\n- b1 3h");
  const fresh = numberOutline(outline);
  assert.deepEqual(fresh.map((u) => [u.code, u.position, u.topics.map((t) => t.code)]), [["1", 0, ["1.1", "1.2"]], ["2", 1, ["2.1"]]]);
  const more = numberOutline(outline, { codes: ["1", "3"], positions: [0, 1] });
  assert.deepEqual(more.map((u) => [u.code, u.position, u.topics.map((t) => [t.code, t.position])]), [["4", 2, [["4.1", 0], ["4.2", 1]]], ["5", 3, [["5.1", 0]]]]);
  assert.equal(more[0].topics[1].est_hours, 2);
  assert.notEqual(more[0].color, more[1].color);
  // Codes fit the database limit (10 letters).
  assert.ok(numberOutline(parseOutline(Array.from({ length: 30 }, (_, i) => `U${i}\n- t`).join("\n")), { codes: ["900"], positions: [] }).every((u) => u.topics.every((t) => t.code.length <= 10)));
});
