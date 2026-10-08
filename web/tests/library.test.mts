// Learning library (certificates & playlists): links, progress, status rules, certificates, lists and the request schemas. Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { applyChange, certificateDatesProblem, certificateExpiry, compareUpNext, courseRollup, expiryLabel, hasCertificate, libraryStats, NEW_FACTS, ofCourse, parseList, progressOf, readLink, resumeLine, suggestSkills, titleFromLink, upNext } from "../lib/library.ts";
import { mergeSkills } from "../lib/jobs.ts";
import { tidyTitle } from "../lib/server/resources.ts";
import { ResourceBulk, ResourceCreate, ResourceFields } from "../lib/server/schemas.ts";
import type { LearningResource } from "../lib/types.ts";

const today = "2026-10-08";
const item = (over: Partial<LearningResource> = {}): LearningResource => ({
  id: "r1", course_id: null, unit_id: null, practice_project_id: null, kind: "certificate", title: "SEO Basics", url: "", platform: "", provider: "",
  status: "todo", priority: "medium", est_hours: 0, items_total: 0, items_done: 0, due_date: null, started_on: null, completed_on: null, cost: 0,
  skills: [], rating: null, takeaway: "", dropped_reason: "", notes: "", certificate_url: "", certificate_id: "", issued_on: null, expires_on: null,
  created_at: "2026-10-01T00:00:00Z", ...over,
});

test("the platform and the kind come from the link", () => {
  assert.deepEqual(readLink("https://www.youtube.com/playlist?list=PL123"), { platform: "YouTube", kind: "playlist" });
  assert.deepEqual(readLink("https://www.youtube.com/watch?v=abc&list=PL123"), { platform: "YouTube", kind: "video" }); // one video inside a list
  assert.deepEqual(readLink("https://www.youtube.com/watch?v=abc"), { platform: "YouTube", kind: "video" });
  assert.deepEqual(readLink("https://youtu.be/abc"), { platform: "YouTube", kind: "video" });
  assert.deepEqual(readLink("https://www.coursera.org/learn/seo"), { platform: "Coursera", kind: "certificate" });
  assert.deepEqual(readLink("udemy.com/course/google-ads"), { platform: "Udemy", kind: "certificate" }); // typed without https://
  assert.deepEqual(readLink("https://academy.hubspot.com/courses/email-marketing"), { platform: "HubSpot Academy", kind: "certificate" });
  assert.deepEqual(readLink("https://skillshop.withgoogle.com/"), { platform: "Google", kind: "certificate" });
  assert.deepEqual(readLink("https://learn.example.com/x"), { platform: "Example", kind: "other" });
  assert.deepEqual(readLink("not a link"), { platform: "", kind: "other" });
  assert.deepEqual(readLink("javascript:alert(1)"), { platform: "", kind: "other" });
  assert.deepEqual(readLink(""), { platform: "", kind: "other" });
});

test("progress is watched out of total, and a completed item is 100%", () => {
  assert.equal(progressOf({ status: "learning", items_total: 24, items_done: 6 }), 25);
  assert.equal(progressOf({ status: "todo", items_total: 0, items_done: 0 }), 0);
  assert.equal(progressOf({ status: "learning", items_total: 0, items_done: 0 }), 0);
  assert.equal(progressOf({ status: "completed", items_total: 0, items_done: 0 }), 100);
  assert.equal(progressOf({ status: "learning", items_total: 3, items_done: 99 }), 100);
});

test("watching videos moves an item from to do to learning to completed, with the dates", () => {
  const first = applyChange(NEW_FACTS, { items_total: 10, items_done: 1 }, today);
  assert.deepEqual([first.status, first.items_done, first.started_on, first.completed_on], ["learning", 1, today, undefined]);

  const learning = { status: "learning", items_total: 10, items_done: 9, started_on: "2026-10-01", completed_on: null };
  const last = applyChange(learning, { items_done: 10 }, today);
  assert.deepEqual([last.status, last.items_done, last.started_on, last.completed_on], ["completed", 10, "2026-10-01", today]); // the start date stays
});

test("completing an item counts every video as watched and sets both dates", () => {
  const done = applyChange({ ...NEW_FACTS }, { status: "completed", items_total: 12 }, today);
  assert.deepEqual([done.status, done.items_done, done.started_on, done.completed_on], ["completed", 12, today, today]);
  // An item with no count has nothing to fill in.
  const plain = applyChange(NEW_FACTS, { status: "completed" }, today);
  assert.deepEqual([plain.items_done, plain.completed_on], [0, today]);
  // The finish date can be chosen.
  assert.equal(applyChange(NEW_FACTS, { status: "completed", completed_on: "2026-09-01" }, today).completed_on, "2026-09-01");
});

test("taking an item back out of completed clears the finish date, and an edit of the title touches no dates", () => {
  const completed = { status: "completed", items_total: 10, items_done: 10, started_on: "2026-09-01", completed_on: "2026-09-20" };
  const back = applyChange(completed, { items_done: 4 }, today);
  assert.deepEqual([back.status, back.items_done, back.completed_on, back.started_on], ["learning", 4, null, "2026-09-01"]);
  const todo = applyChange(completed, { status: "todo" }, today);
  assert.deepEqual([todo.status, todo.completed_on], ["todo", null]);
  const rename = applyChange(completed, { title: "New name" }, today);
  assert.deepEqual([rename.status, rename.items_done, rename.completed_on, rename.started_on], ["completed", 10, undefined, undefined]);
});

test("the count never goes beyond the total, and no total means no count", () => {
  const learning = { status: "learning", items_total: 10, items_done: 8, started_on: "2026-10-01", completed_on: null };
  assert.equal(applyChange(learning, { items_total: 5 }, today).items_done, 5);
  assert.equal(applyChange(learning, { items_total: 5 }, today).status, "completed"); // 5 of 5
  assert.equal(applyChange(learning, { items_total: 0 }, today).items_done, 0);
  assert.equal(applyChange(learning, { items_done: 50 }, today).items_done, 10);
  assert.equal(applyChange(NEW_FACTS, { items_done: 3 }, today).items_done, 0); // nothing to count against
});

test("dropping an item changes nothing else; starting one sets the start date once", () => {
  const dropped = applyChange({ status: "learning", items_total: 10, items_done: 3, started_on: "2026-10-01", completed_on: null }, { status: "dropped", dropped_reason: "Too basic" }, today);
  assert.deepEqual([dropped.status, dropped.items_done, dropped.started_on], ["dropped", 3, undefined]);
  assert.equal(applyChange(NEW_FACTS, { status: "learning" }, today).started_on, today);
  assert.equal(applyChange({ status: "todo", items_total: 0, items_done: 0, started_on: "2026-09-01", completed_on: null }, { status: "learning" }, today).started_on, "2026-09-01");
});

test("a certificate cannot expire before it was issued", () => {
  assert.equal(certificateDatesProblem("2026-10-01", "2027-10-01"), null);
  assert.equal(certificateDatesProblem("2026-10-01", "2026-09-01") !== null, true);
  assert.equal(certificateDatesProblem(null, "2026-09-01"), null);
  assert.equal(certificateDatesProblem("2026-10-01", null), null);
});

test("certificates: earned, valid, expiring soon, expired", () => {
  assert.equal(hasCertificate(item({ status: "completed", certificate_url: "https://c.example/1" })), true);
  assert.equal(hasCertificate(item({ status: "completed", certificate_id: "ABC" })), true);
  assert.equal(hasCertificate(item({ status: "completed" })), false);
  assert.equal(hasCertificate(item({ status: "learning", certificate_id: "ABC" })), false);

  assert.equal(certificateExpiry({ expires_on: null }, today).state, "none");
  assert.deepEqual(certificateExpiry({ expires_on: "2027-10-08" }, today), { state: "valid", days: 365 });
  assert.deepEqual(certificateExpiry({ expires_on: "2026-11-07" }, today), { state: "soon", days: 30 });
  assert.deepEqual(certificateExpiry({ expires_on: "2026-11-08" }, today), { state: "valid", days: 31 });
  assert.deepEqual(certificateExpiry({ expires_on: "2026-10-08" }, today), { state: "soon", days: 0 });
  assert.deepEqual(certificateExpiry({ expires_on: "2026-10-07" }, today), { state: "expired", days: -1 });

  assert.equal(expiryLabel({ expires_on: null }, today), "");
  assert.equal(expiryLabel({ expires_on: "2026-10-08" }, today), "Expires today");
  assert.equal(expiryLabel({ expires_on: "2026-10-09" }, today), "Expires tomorrow");
  assert.equal(expiryLabel({ expires_on: "2026-10-20" }, today), "Expires in 12 days");
  assert.equal(expiryLabel({ expires_on: "2026-10-07" }, today), "Expired yesterday");
  assert.equal(expiryLabel({ expires_on: "2026-10-01" }, today), "Expired 7 days ago");
  assert.equal(expiryLabel({ expires_on: "2027-10-08" }, today), "Valid until Oct 2027");
});

test("the numbers at the top of the library", () => {
  const list = [
    item({ id: "a", status: "todo", cost: 500 }),
    item({ id: "b", status: "learning", est_hours: 10, items_total: 10, items_done: 5, cost: 0 }),
    item({ id: "c", status: "completed", est_hours: 6, certificate_id: "X1", cost: 1200.5 }),
    item({ id: "d", status: "completed", est_hours: 2 }),
    item({ id: "e", status: "dropped", cost: 999 }),
  ];
  const stats = libraryStats(list);
  assert.deepEqual([stats.todo, stats.learning, stats.completed, stats.dropped, stats.certificates], [1, 1, 2, 1, 1]);
  assert.equal(stats.hours, 13); // 6 + 2 finished, half of the 10 started
  assert.equal(stats.spent, 1700.5); // dropped items are not counted
  assert.equal(stats.tooManyStarted, false);
  assert.equal(libraryStats(Array.from({ length: 4 }, (_, i) => item({ id: String(i), status: "learning" }))).tooManyStarted, true);
  assert.deepEqual(libraryStats([]), { todo: 0, learning: 0, completed: 0, dropped: 0, certificates: 0, hours: 0, spent: 0, tooManyStarted: false });
});

test("up next: what you started, then the nearest deadline, then priority, then the oldest", () => {
  const list = [
    item({ id: "low-old", priority: "low", created_at: "2026-01-01T00:00:00Z" }),
    item({ id: "high-new", priority: "high", created_at: "2026-09-01T00:00:00Z" }),
    item({ id: "due-late", due_date: "2026-12-01" }),
    item({ id: "due-soon", due_date: "2026-10-20", priority: "low" }),
    item({ id: "started", status: "learning", priority: "low" }),
    item({ id: "done", status: "completed" }),
    item({ id: "dropped", status: "dropped" }),
  ];
  assert.deepEqual(upNext(list, 10).map((r) => r.id), ["started", "due-soon", "due-late", "high-new", "low-old"]);
  assert.deepEqual(upNext(list).map((r) => r.id), ["started", "due-soon", "due-late"]);
  assert.equal(compareUpNext(item({ id: "x" }), item({ id: "x" })), 0);
});

test("a subject (course) shows how many of its items are completed", () => {
  const list = [
    item({ id: "a", course_id: "c1", status: "completed", est_hours: 6 }),
    item({ id: "b", course_id: "c1", status: "completed", est_hours: 4.5 }),
    item({ id: "c", course_id: "c1", status: "learning", est_hours: 10 }),
    item({ id: "d", course_id: "c1", status: "dropped", est_hours: 99 }),
    item({ id: "e", course_id: "c2", status: "completed", est_hours: 3 }),
    item({ id: "f", course_id: null }),
  ];
  assert.deepEqual(courseRollup(ofCourse(list, "c1")), { total: 3, completed: 2, hours: 10.5 });
  assert.deepEqual(ofCourse(list, null).map((r) => r.id), ["f"]);
  assert.deepEqual(courseRollup([]), { total: 0, completed: 0, hours: 0 });
});

test("skills to add after finishing: the item's own, else those its title mentions", () => {
  assert.deepEqual(suggestSkills(item({ skills: ["SEO", "GA4"] })), ["SEO", "GA4"]);
  assert.deepEqual(suggestSkills(item({ title: "Google Ads and Google Analytics for beginners" })), ["Google Ads", "Google Analytics"]);
  assert.deepEqual(suggestSkills(item({ title: "A very nice course", notes: "" })), []);
});

test("merging skills ignores doubles written another way", () => {
  assert.deepEqual(mergeSkills(["React", "SQL"], ["react.js", "Docker", "docker", " ", "SQL"]), { skills: ["React", "SQL", "Docker"], added: ["Docker"] });
  assert.deepEqual(mergeSkills([], ["Excel"]), { skills: ["Excel"], added: ["Excel"] });
  assert.deepEqual(mergeSkills(["Excel"], []), { skills: ["Excel"], added: [] });
});

test("a line for a CV or LinkedIn", () => {
  const line = resumeLine(item({ title: "SEO Basics", platform: "Coursera", completed_on: "2026-10-05", skills: ["SEO", "Google Analytics"], certificate_id: " ABC123 " }));
  assert.equal(line, "Completed SEO Basics (Coursera, Oct 2026) — skills: SEO, Google Analytics — certificate ID ABC123");
  assert.equal(resumeLine(item({ title: "Intro to SQL", provider: "freeCodeCamp" })), "Completed Intro to SQL (freeCodeCamp)");
  assert.equal(resumeLine(item({ title: "Intro", issued_on: "2026-03-01", completed_on: "2026-10-05" })), "Completed Intro (Mar 2026)"); // the issue date wins
  assert.equal(resumeLine(item({ title: "Plain" })), "Completed Plain");
});

test("a pasted list: links, titles, or both, with bullets and numbers removed", () => {
  const text = `
    https://www.youtube.com/playlist?list=PL1
    - SEO Basics | https://www.coursera.org/learn/seo
    2) Google Ads Search
    www.udemy.com/course/email | Email marketing

    * Content Writing | not a link
  `;
  assert.deepEqual(parseList(text), [
    { title: "", url: "https://www.youtube.com/playlist?list=PL1" },
    { title: "SEO Basics", url: "https://www.coursera.org/learn/seo" },
    { title: "Google Ads Search", url: "" },
    { title: "Email marketing", url: "https://www.udemy.com/course/email" },
    { title: "Content Writing", url: "" },
  ]);
  assert.deepEqual(parseList("  \n \n"), []);
});

test("a title can be made from a link when the page cannot be read", () => {
  assert.equal(titleFromLink("https://www.coursera.org/learn/seo-basics-course"), "Seo Basics Course");
  assert.equal(titleFromLink("https://example.com/courses/google_ads.html"), "Google Ads");
  assert.equal(titleFromLink("https://www.youtube.com/playlist?list=PL1"), "youtube.com"); // "playlist" says nothing
  assert.equal(titleFromLink("https://www.udemy.com/"), "udemy.com");
  assert.equal(titleFromLink("https://example.com/a/12345"), "example.com");
  assert.doesNotThrow(() => titleFromLink("https://example.com/%E0%A4%A")); // a broken %-code does not throw
});

test("page titles lose the site name at the end", () => {
  assert.equal(tidyTitle("SEO Basics | Coursera", ["Coursera"]), "SEO Basics");
  assert.equal(tidyTitle("Intro to SQL - YouTube", ["YouTube", ""]), "Intro to SQL");
  assert.equal(tidyTitle("Google Ads - Search Campaigns - Skillshop", ["Google", "Skillshop"]), "Google Ads - Search Campaigns");
  assert.equal(tidyTitle("Learn Excel | Free Course", ["Coursera"]), "Learn Excel - Free Course"); // not a known site: kept (joined with a dash)
  assert.equal(tidyTitle("Just a title", ["Coursera"]), "Just a title");
});

test("library requests: strict, bounded, links must be web links", () => {
  assert.equal(ResourceCreate.safeParse({ title: "SEO Basics" }).success, true);
  assert.equal(ResourceCreate.safeParse({}).success, false);
  assert.equal(ResourceCreate.safeParse({ title: "  " }).success, false);
  assert.equal(ResourceCreate.safeParse({ title: "x", surprise: 1 }).success, false);
  assert.equal(ResourceCreate.safeParse({ title: "x", kind: "movie" }).success, false);
  assert.equal(ResourceCreate.safeParse({ title: "x", url: "https://example.com/a" }).success, true);
  assert.equal(ResourceCreate.safeParse({ title: "x", url: "javascript:alert(1)" }).success, false);
  assert.equal(ResourceCreate.safeParse({ title: "x", url: "example.com" }).success, false);
  assert.equal(ResourceCreate.safeParse({ title: "x", certificate_url: "data:text/html,x" }).success, false);
  assert.equal(ResourceCreate.safeParse({ title: "x", rating: 6 }).success, false);
  assert.equal(ResourceCreate.safeParse({ title: "x", rating: null }).success, true);
  assert.equal(ResourceCreate.safeParse({ title: "x", items_total: 5001 }).success, false);
  assert.equal(ResourceCreate.safeParse({ title: "x", est_hours: -1 }).success, false);
  assert.equal(ResourceCreate.safeParse({ title: "x", skills: Array.from({ length: 31 }, () => "a") }).success, false);
  assert.equal(ResourceFields.safeParse({ status: "completed" }).success, true); // PATCH: any single field
  assert.equal(ResourceFields.safeParse({ created_at: "2026-01-01" }).success, false);
  assert.equal(ResourceFields.safeParse({ practice_project_id: "11111111-1111-4111-8111-111111111111" }).success, false); // set by the practice step only
});

test("pasting many items: up to 50, each with a title or a link", () => {
  const ok = { items: [{ title: "a", url: "" }, { title: "", url: "https://example.com" }] };
  assert.equal(ResourceBulk.safeParse(ok).success, true);
  assert.equal(ResourceBulk.safeParse({ items: [] }).success, false);
  assert.equal(ResourceBulk.safeParse({ items: [{ title: "", url: "" }] }).success, false);
  assert.equal(ResourceBulk.safeParse({ items: Array.from({ length: 51 }, () => ({ title: "a", url: "" })) }).success, false);
  assert.equal(ResourceBulk.safeParse({ ...ok, course_id: "11111111-1111-4111-8111-111111111111", kind: "playlist" }).success, true);
});
