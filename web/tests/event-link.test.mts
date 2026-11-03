// Calendar: the optional event link and the longer note. Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { EventFields } from "../lib/server/schemas.ts";
import { fixLink } from "../lib/library.ts";

const base = { title: "CV training", event_date: "2026-11-08", all_day: true };

test("an event can have a link (https or http), or none", () => {
  assert.equal(EventFields.safeParse({ ...base, link: "https://meet.google.com/abc-defg-hij" }).success, true);
  assert.equal(EventFields.safeParse({ ...base, link: "http://example.com/join?id=1" }).success, true);
  assert.equal(EventFields.safeParse({ ...base, link: "" }).success, true, "empty = no link");
  assert.equal(EventFields.safeParse(base).success, true, "the link is optional");
});

test("only web links are accepted: no scripts, files or half links", () => {
  for (const bad of ["javascript:alert(1)", "data:text/html,<script>1</script>", "file:///etc/passwd", "ftp://example.com/a", "meet.google.com/abc", "not a link", "https://"]) {
    assert.equal(EventFields.safeParse({ ...base, link: bad }).success, false, bad);
  }
});

test("a link can be up to 500 characters", () => {
  const long = (n: number) => "https://example.com/" + "a".repeat(n - "https://example.com/".length);
  assert.equal(EventFields.safeParse({ ...base, link: long(500) }).success, true);
  assert.equal(EventFields.safeParse({ ...base, link: long(501) }).success, false);
});

test("the note can be up to 1,000 characters (a text area now), with line breaks", () => {
  assert.equal(EventFields.safeParse({ ...base, note: "8th November: CV Making\n9th November: Interview skills\n" + "x".repeat(900) }).success, true);
  assert.equal(EventFields.safeParse({ ...base, note: "x".repeat(1000) }).success, true);
  assert.equal(EventFields.safeParse({ ...base, note: "x".repeat(1001) }).success, false);
});

test("a link typed without https:// gets it before it is sent", () => {
  assert.equal(fixLink("meet.google.com/abc-defg-hij"), "https://meet.google.com/abc-defg-hij");
  assert.equal(fixLink("  zoom.us/j/123  "), "https://zoom.us/j/123");
  assert.equal(fixLink("https://zoom.us/j/123"), "https://zoom.us/j/123");
  assert.equal(fixLink(""), "");
});
