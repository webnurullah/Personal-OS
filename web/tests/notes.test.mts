// Course notes (the text editor's HTML), the link box and what the assistant is given. Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { withoutCourseNotes } from "../lib/server/assistant/scrub.ts";
import { CourseNotes } from "../lib/server/schemas.ts";
import { webAddress } from "../lib/web-address.ts";

test("a typed web address becomes a full link; only http and https are links", () => {
  assert.equal(webAddress("example.com"), "https://example.com/");
  assert.equal(webAddress("  www.example.com/a/b?x=1 "), "https://www.example.com/a/b?x=1");
  assert.equal(webAddress("http://example.com/page"), "http://example.com/page");
  assert.equal(webAddress("HTTPS://Example.com"), "https://example.com/");
  assert.equal(webAddress("example.com:8080/x"), "https://example.com:8080/x", "a port is not a scheme");
  assert.equal(webAddress("//example.com"), "https://example.com/");
  for (const bad of ["", "   ", "javascript:alert(1)", "data:text/html,<b>x</b>", "mailto:me@example.com", "ftp://example.com/file", "file:///etc/passwd", "my notes", "localhost", "https://", "http://.", "exa\u0000mple.com", "ex\nample.com"]) {
    assert.equal(webAddress(bad), null, JSON.stringify(bad));
  }
});

test("what the notes route accepts: the editor's HTML as it is, up to about 100,000 letters", () => {
  const html = "<h2>Key points</h2><p>SEO needs <strong>patience</strong> — <a href=\"https://moz.com/\">Moz</a></p><ul><li><p>one</p></li></ul>\n\n";
  assert.deepEqual(CourseNotes.parse({ notes: html }), { notes: html }, "no trimming, nothing changed");
  assert.deepEqual(CourseNotes.parse({ notes: "" }), { notes: "" }, "empty notes are fine");
  assert.equal(CourseNotes.safeParse({ notes: "x".repeat(100000) }).success, true);
  assert.equal(CourseNotes.safeParse({ notes: "x".repeat(100001) }).success, false);
  assert.equal(CourseNotes.safeParse({ notes: "a\u0000b" }).success, false);
  assert.equal(CourseNotes.safeParse({}).success, false, "the notes must be sent");
  assert.equal(CourseNotes.safeParse({ notes: "x", public: true }).success, false, "there is nothing else to set (no public link)");
  assert.equal(CourseNotes.safeParse({ notes: "x", title: "no other fields" }).success, false);
});

test("the assistant is not given a course's notes, but topics keep their notes", () => {
  const course = { id: "c1", title: "SEO", notes: "<p>" + "x".repeat(5000) + "</p>", notes_updated_at: "2026-10-01T00:00:00Z", color: "blue" };
  const topic = { id: "t1", title: "Keywords", notes: "a topic note" };
  const answer = withoutCourseNotes({ today: "2026-10-11", course, units: [{ id: "u1", topics: [topic] }] }) as { course: Record<string, unknown>; units: { topics: Record<string, unknown>[] }[] };
  assert.deepEqual(answer.course, { id: "c1", title: "SEO", color: "blue" });
  assert.deepEqual(answer.units[0].topics[0], topic);
  assert.deepEqual(withoutCourseNotes({ ...course, notes_updated_at: null }), { id: "c1", title: "SEO", color: "blue" }, "a course row on its own, with no notes time yet");
  assert.deepEqual(withoutCourseNotes([1, "x", null, { a: [{ notes_updated_at: null, notes: "n", b: 1 }] }]), [1, "x", null, { a: [{ b: 1 }] }]);
  assert.equal(withoutCourseNotes(null), null);
});
