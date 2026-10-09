// Learning: revision schedule, focus timer and topic matching for Quick Add. Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { clock, elapsedMs, FOCUS_KEY, loggedHours, readFocus } from "../lib/focus.ts";
import { finishedText, REVISION_DAYS, revisionDue, type RevisionCandidate } from "../lib/revision.ts";
import { matchBest, wordsOf } from "../lib/study-match.ts";

const TODAY = "2026-10-20";
const cand = (id: string, finishedOn: string, step = 0, kind: "topic" | "resource" = "topic"): RevisionCandidate => ({ kind, id, title: `T ${id}`, label: id, step, finishedOn, href: "/learning" });

test("a finished topic is due to be looked at again 1, 7 and 21 days later", () => {
  assert.deepEqual(REVISION_DAYS, [1, 7, 21]);
  assert.deepEqual(revisionDue([cand("a", "2026-10-20")], TODAY), [], "finished today: not yet");
  assert.deepEqual(revisionDue([cand("a", "2026-10-19")], TODAY).map((i) => [i.id, i.dueAfter, i.daysSince, i.waiting]), [["a", 1, 1, 0]]);
  assert.equal(revisionDue([cand("a", "2026-10-13", 1)], TODAY).length, 1, "a week later, the second look");
  assert.equal(revisionDue([cand("a", "2026-10-14", 1)], TODAY).length, 0, "6 days: the second look is not due yet");
  assert.equal(revisionDue([cand("a", "2026-09-29", 2)], TODAY).length, 1, "21 days later, the third look");
  assert.equal(revisionDue([cand("a", "2026-09-01", 3)], TODAY).length, 0, "all three done");
  assert.equal(revisionDue([cand("a", "2026-10-19", -1)], TODAY).length, 0);
});

test("a look-back that was due long ago is let go, and the list puts the longest-waiting first", () => {
  const items = revisionDue([cand("old", "2026-08-01", 0), cand("fresh", "2026-10-19", 0), cand("waiting", "2026-10-15", 0), cand("lib", "2026-10-18", 0, "resource")], TODAY);
  assert.deepEqual(items.map((i) => i.id), ["waiting", "lib", "fresh"]);
  assert.equal(items.find((i) => i.id === "waiting")?.waiting, 4);
  assert.equal(revisionDue([cand("edge", "2026-09-19", 0)], TODAY).length, 1, "30 days after it was due is still shown");
  assert.equal(revisionDue([cand("edge", "2026-09-18", 0)], TODAY).length, 0, "31 is not");
});

test("how finishing reads", () => {
  assert.equal(finishedText(0), "finished today");
  assert.equal(finishedText(1), "finished yesterday");
  assert.equal(finishedText(7), "finished 7 days ago");
});

test("the focus timer: what is stored, the clock, and the hours it becomes", () => {
  const id = "3f2c8a1e-9c1b-4d6e-8f4a-1b2c3d4e5f60";
  assert.equal(FOCUS_KEY, "pos-focus");
  assert.deepEqual(readFocus(JSON.stringify({ startedAt: 1_700_000_000_000, choice: `t:${id}` })), { startedAt: 1_700_000_000_000, choice: `t:${id}` });
  assert.deepEqual(readFocus(JSON.stringify({ startedAt: 1_700_000_000_000 })), { startedAt: 1_700_000_000_000, choice: "" });
  assert.deepEqual(readFocus(JSON.stringify({ startedAt: 1_700_000_000_000, choice: "t:not-an-id" })), { startedAt: 1_700_000_000_000, choice: "" });
  for (const bad of [null, "", "nope", "{}", JSON.stringify({ startedAt: "x" }), JSON.stringify({ startedAt: -5 }), JSON.stringify({ startedAt: 0 }), JSON.stringify([1])]) assert.equal(readFocus(bad), null, String(bad));
  assert.equal(elapsedMs({ startedAt: 1000, choice: "" }, 4000), 3000);
  assert.equal(elapsedMs({ startedAt: 5000, choice: "" }, 4000), 0, "a clock set back never gives a negative time");
  assert.equal(clock(0), "00:00");
  assert.equal(clock(59_999), "00:59");
  assert.equal(clock(12 * 60_000 + 3000), "12:03");
  assert.equal(clock(3_723_000), "1:02:03");
  const min = 60_000;
  assert.equal(loggedHours(0), 0.25, "at least a quarter hour");
  assert.equal(loggedHours(5 * min), 0.25);
  assert.equal(loggedHours(10 * min), 0.25);
  assert.equal(loggedHours(11 * min), 0.25);
  assert.equal(loggedHours(23 * min), 0.5, "to the nearest quarter");
  assert.equal(loggedHours(60 * min), 1);
  assert.equal(loggedHours(100 * min), 1.75);
  assert.equal(loggedHours(30 * 60 * min), 24, "at most a day");
});

test("which topic the words are about", () => {
  assert.deepEqual(wordsOf("SQL joins, 2.1!"), ["sql", "joins"]);
  assert.deepEqual(wordsOf("বাংলা ভাষা"), ["বাংলা", "ভাষা"]);
  const items = [{ id: "a", label: "1.1 Introduction to SQL" }, { id: "b", label: "2.1 SQL joins" }, { id: "c", label: "3.1 Window functions" }, { id: "d", label: "4.1 Excel pivot tables" }];
  assert.equal(matchBest("sql joins", items)?.id, "b");
  assert.equal(matchBest("join", items)?.id, "b", "the start of a word counts");
  assert.equal(matchBest("pivot", items)?.id, "d");
  assert.equal(matchBest("window", items)?.id, "c");
  assert.equal(matchBest("sql", items), null, "two topics are equally good: no guess");
  assert.equal(matchBest("cooking", items), null);
  assert.equal(matchBest("", items), null);
  assert.equal(matchBest("a b", items), null, "one-letter words are not words");
  assert.equal(matchBest("sql", []), null);
  assert.equal(matchBest("introduction sql", items)?.id, "a", "more shared words wins");
});
