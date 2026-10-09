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

test("a hostile paste of 30,000 letters is read in a moment (no regex that takes quadratic time)", () => {
  const cases = [
    "- a" + " ".repeat(29_000) + "x",
    "- x" + ". ".repeat(14_000) + "y",
    "- x" + " |".repeat(14_000) + "y",
    "x" + " - ".repeat(9_000) + "y\n- t",
    "- " + "1 ".repeat(14_000) + "x",
    "- " + "1".repeat(29_000) + "h",
    "x " + "1.5 ".repeat(7_000) + "h",
    // Hours followed by a very long run of spaces or tabs (a tab counts as 4 spaces when read).
    "- x 1h" + "\t".repeat(29_000) + "x",
    "- x 1-1h" + "\t".repeat(29_000) + "x",
    "- x 1h 30m" + "\t".repeat(29_000) + "x",
    "- x 1h30m" + " ".repeat(29_000) + "x",
    "Unit " + "1".repeat(29_000) + ".1\n- t",
  ];
  for (const text of cases) {
    const started = performance.now();
    parseOutline(text);
    assert.ok(performance.now() - started < 250, `${text.slice(0, 12)}… took ${Math.round(performance.now() - started)} ms`);
  }
});

test("a long flat list is still one unit of topics; a skeleton of units stays units", () => {
  const lessons = Array.from({ length: 45 }, (_, i) => `Lesson ${i + 1} 1h`).join("\n");
  const flat = parseOutline(lessons);
  assert.deepEqual([flat.units.length, flat.units[0].title, flat.topicCount], [1, "Topics", 45]);
  assert.deepEqual(flat.warnings, []);
  assert.deepEqual(shape("Unit 1: Basics\nUnit 2: Advanced\nUnit 3: Project"), [["Basics", []], ["Advanced", []], ["Project", []]]);
  assert.deepEqual(shape("## Basics\n## Advanced"), [["Basics", []], ["Advanced", []]]);
  assert.deepEqual(shape("Tools:\nBasics:"), [["Tools", []], ["Basics", []]]);
  assert.deepEqual(shape("1. Basics\n2. Advanced"), [["Basics", []], ["Advanced", []]]);
});

test("numbered topics under 'Unit 1:' style headings are topics", () => {
  assert.deepEqual(shape("Unit 1: A\n1. x\n2. y\nUnit 2: B\n1. z"), [["A", [["x", 2], ["y", 2]]], ["B", [["z", 2]]]]);
  assert.deepEqual(shape("Module 1 - A\n1) x 1h\nModule 2 - B\n1) z"), [["A", [["x", 1]]], ["B", [["z", 2]]]]);
});

test("titles keep their dots and hyphens; only real heading words are taken off", () => {
  assert.deepEqual(shape("U\n- .NET Core | 3h\n- .htaccess rules\n- Intro."), [["U", [[".NET Core", 3], [".htaccess rules", 2], ["Intro", 2]]]]);
  const titles = (text: string) => parseOutline(text).units.map((u) => u.title);
  assert.deepEqual(titles("Unit-testing frameworks:\n- a\nPart-time work:\n- b\nModule 1.1 Introduction:\n- c\nPart I will teach:\n- d"), ["Unit-testing frameworks", "Part-time work", "Module 1.1 Introduction", "Part I will teach"]);
  assert.deepEqual(titles("Unit - Basics\n- a\nPart III: Ads\n- b\nChapter 4. Wrap-up\n- c\nSection: Last\n- d"), ["Basics", "Ads", "Wrap-up", "Last"]);
});

test("more ways to write the hours; numbers that belong to the title are left alone", () => {
  const read = (line: string) => takeHours(line);
  assert.deepEqual(read("Kotlin 1h30m"), { text: "Kotlin", hours: 1.5 });
  assert.deepEqual(read("Kotlin 1h 30 min"), { text: "Kotlin", hours: 1.5 });
  assert.deepEqual(read("Rust ~2h"), { text: "Rust", hours: 2 });
  assert.deepEqual(read("Go (2-3h)"), { text: "Go", hours: 3 });
  assert.deepEqual(read("Go 2–3 hours"), { text: "Go", hours: 3 });
  assert.deepEqual(read("Docker | 1 hour"), { text: "Docker", hours: 1 });
  assert.deepEqual(read("Docker in 1 hour"), { text: "Docker in 1 hour", hours: null });
  assert.deepEqual(read("Python Full Course in 4 Hours"), { text: "Python Full Course in 4 Hours", hours: null });
  assert.deepEqual(read("Python Full Course - 4 Hours"), { text: "Python Full Course", hours: 4 });
  assert.deepEqual(read("Excel for 30 minutes"), { text: "Excel for 30 minutes", hours: null });
});

test("a number in the title is not taken for the start of a range of hours", () => {
  const read = (line: string) => { const t = parseOutline(`- ${line}`).units[0].topics[0]; return [t.title, t.hours]; };
  assert.deepEqual(read("Windows 10 - 2h"), ["Windows 10", 2]);
  assert.deepEqual(read("SQL 101 - 3h"), ["SQL 101", 3]);
  assert.deepEqual(read("Excel 2016 - 90m"), ["Excel 2016", 1.5]);
  assert.deepEqual(read("Python 3.11 - 2h"), ["Python 3.11", 2]);
  assert.deepEqual(read("Lesson 2 - 3h"), ["Lesson 2", 3]);
  assert.deepEqual(read("Day 3 – 1h"), ["Day 3", 1]);
  assert.deepEqual(read("SQL 101-3h"), ["SQL 101", 3]); // a range goes up
  assert.deepEqual(read("Go (2-3h)"), ["Go", 3]);
  assert.deepEqual(read("Go 2–3h"), ["Go", 3]);
  assert.equal(parseOutline("Windows 10 - 2h\n- x").units[0].title, "Windows 10");
});

test("a colon heading makes numbered lines topics; numbered lines with topics of their own stay units", () => {
  const colon = parseOutline("Basics:\n1. a\n2. b\nAdvanced:\n1. c");
  assert.deepEqual(colon.units.map((u) => [u.title, u.topics.map((t) => t.title)]), [["Basics", ["a", "b"]], ["Advanced", ["c"]]]);
  const titled = parseOutline("# My course\n1. SEO\n   - keywords\n2. Ads\n   - google");
  assert.deepEqual(titled.units.map((u) => [u.title, u.topics.map((t) => t.title)]), [["My course", []], ["SEO", ["keywords"]], ["Ads", ["google"]]]);
  const part = parseOutline("1. SEO\n- keywords\nPart 2\n2. Ads\n- google");
  assert.deepEqual(part.units.map((u) => u.title).slice(0, 1), ["SEO"]);
  const words = parseOutline("Unit 1: Basics\n1. what\n2. why\nUnit 2: More\n1. how");
  assert.deepEqual(words.units.map((u) => [u.title, u.topics.length]), [["Basics", 2], ["More", 1]]);
});

test("a heading word needs a real number after it", () => {
  assert.equal(parseOutline("Part 3D printing\n- slicing").units[0].title, "Part 3D printing");
  assert.equal(parseOutline("Chapter 5G networks\n- x").units[0].title, "Chapter 5G networks");
  assert.equal(parseOutline("Module 2FA\n- x").units[0].title, "Module 2FA");
  assert.equal(parseOutline("Unit 3a Basics\n- x").units[0].title, "Unit 3a Basics");
  assert.equal(parseOutline("Unit 3: Basics\n- x").units[0].title, "Basics");
  assert.equal(parseOutline("Chapter 4. Ads\n- x").units[0].title, "Ads");
  assert.equal(parseOutline("Module III - Ads\n- x").units[0].title, "Ads");
});
