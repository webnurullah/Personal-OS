// Course notes and their public link: the text pieces, the link code and what the API accepts. Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { isLinkCode, publicNotesUrl, splitLinks } from "../lib/linkify.ts";
import { loadPublicNotes } from "../lib/server/public-notes.ts";
import { CourseNotes } from "../lib/server/schemas.ts";

const join = (pieces: { text: string }[]) => pieces.map((p) => p.text).join("");

test("web addresses in notes become links, the rest stays exactly as typed", () => {
  const text = "Read https://example.com/a/b?x=1#top and http://other.org.\nThen\n\n  indent  kept";
  const pieces = splitLinks(text);
  assert.equal(join(pieces), text.replace("http://other.org.", "http://other.org."), "nothing is lost or changed");
  assert.deepEqual(pieces.filter((p) => p.href).map((p) => p.href), ["https://example.com/a/b?x=1#top", "http://other.org"]);
});

test("a full stop, comma or bracket after an address is not part of it", () => {
  for (const [typed, href] of [["(see https://example.com/page)", "https://example.com/page"], ["go to https://example.com/a, then", "https://example.com/a"], ["https://example.com/a?b=c!", "https://example.com/a?b=c"], ["“https://example.com/q”", "https://example.com/q"]] as const) {
    const links = splitLinks(typed).filter((p) => p.href);
    assert.deepEqual(links.map((p) => p.href), [href], typed);
    assert.equal(join(splitLinks(typed)), typed);
  }
});

test("only http and https addresses are links; script and other schemes are plain text", () => {
  for (const typed of ["javascript:alert(1)", "data:text/html,<script>1</script>", "ftp://example.com/file", "mailto:me@example.com", "https://", "http:// not an address", "<script>alert(1)</script>", "[x](javascript:alert(1))"]) {
    assert.deepEqual(splitLinks(typed).filter((p) => p.href), [], typed);
    assert.equal(join(splitLinks(typed)), typed);
  }
  // A link stops at a quote or a tag, so it cannot carry markup along.
  assert.deepEqual(splitLinks('x https://example.com/a"onmouseover="1').filter((p) => p.href).map((p) => p.href), ["https://example.com/a"]);
  assert.deepEqual(splitLinks("https://example.com/a<b>").filter((p) => p.href).map((p) => p.href), ["https://example.com/a"]);
});

test("empty and link-only notes", () => {
  assert.deepEqual(splitLinks(""), []);
  assert.deepEqual(splitLinks("https://example.com"), [{ text: "https://example.com", href: "https://example.com" }]);
});

test("the public address is on the same site, with the code", () => {
  assert.equal(publicNotesUrl("https://pos.nurullah.com.bd", "abc"), "https://pos.nurullah.com.bd/shared/course/abc");
  assert.equal(publicNotesUrl("http://localhost:3000/", "abc"), "http://localhost:3000/shared/course/abc");
});

test("a link code is a UUID, and nothing else reaches the database", async () => {
  assert.equal(isLinkCode("0f1e2d3c-4b5a-4968-8776-655443322110"), true);
  assert.equal(isLinkCode("0F1E2D3C-4B5A-4968-8776-655443322110"), true);
  for (const bad of ["", "abc", "0f1e2d3c-4b5a-4968-8776-65544332211", "0f1e2d3c-4b5a-4968-8776-6554433221100", "0f1e2d3c-4b5a-4968-8776-65544332211z", "' or 1=1 --", "../../etc/passwd"]) assert.equal(isLinkCode(bad), false, bad);
  // (no database is set up here: a wrong code is answered before the database is asked)
  for (const bad of ["", "abc", "' or 1=1 --"]) assert.equal(await loadPublicNotes(bad), null);
});

test("what the notes route accepts", () => {
  assert.deepEqual(CourseNotes.parse({ notes: "  kept as typed \n\n" }), { notes: "  kept as typed \n\n" }, "no trimming: this is writing");
  assert.deepEqual(CourseNotes.parse({ public: true }), { public: true });
  assert.deepEqual(CourseNotes.parse({ notes: "", public: false }), { notes: "", public: false });
  assert.equal(CourseNotes.safeParse({ notes: "x".repeat(20000) }).success, true);
  assert.equal(CourseNotes.safeParse({ notes: "x".repeat(20001) }).success, false);
  assert.equal(CourseNotes.safeParse({ notes: "a\u0000b" }).success, false);
  assert.equal(CourseNotes.safeParse({ public: "yes" }).success, false);
  assert.equal(CourseNotes.safeParse({ notes: "x", title: "no other fields" }).success, false);
  assert.equal(CourseNotes.safeParse({ notes_share: "0f1e2d3c-4b5a-4968-8776-655443322110" }).success, false, "a link code cannot be chosen, only turned on");
});
