// The Archive: names, what goes with an item, and the confirmation texts. Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ARCHIVE_KINDS, foreverMessage, kindName, relatedText, toArchive } from "../lib/archive.ts";

// Every kind the database function knows (supabase/migrations/20261008000100_archive_items.sql) has a name and a home page.
const DATABASE_KINDS = ["task", "note", "event", "goal", "milestone", "habit", "course", "unit", "topic", "study_block", "transaction", "bill", "budget_category", "category", "reminder", "job"];

test("every kind of item that can be archived has a name and a page to find it on", () => {
  for (const kind of [...DATABASE_KINDS, "project"]) {
    assert.ok(ARCHIVE_KINDS[kind], kind);
    assert.ok(ARCHIVE_KINDS[kind].label.length > 0);
    assert.match(ARCHIVE_KINDS[kind].href, /^\//);
  }
  assert.equal(kindName("task"), "Task");
  assert.equal(kindName("study_block"), "Study block");
  assert.equal(kindName("something-new"), "Item");
});

test("the app and the database agree on what can be archived", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20261008000100_archive_items.sql", import.meta.url), "utf8");
  const inCheck = sql.match(/kind in \(([^)]*)\)/)?.[1].match(/'([a-z_]+)'/g)?.map((k) => k.replaceAll("'", "")) ?? [];
  assert.deepEqual([...inCheck].sort(), [...DATABASE_KINDS].sort());
  // …and the server's list of kinds (lib/server/archive.ts) names exactly those too.
  const ts = readFileSync(new URL("../lib/server/archive.ts", import.meta.url), "utf8");
  const typed = [...ts.slice(ts.indexOf("export type ArchiveKind"), ts.indexOf("/** Moves")).matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...typed].sort(), [...DATABASE_KINDS].sort());
});

test("what went with an item is said in words, and not at all when nothing did", () => {
  assert.equal(relatedText("goal", 3), "3 milestones");
  assert.equal(relatedText("goal", 1), "1 milestone");
  assert.equal(relatedText("goal", 0), "");
  assert.equal(relatedText("project", 4), "4 tasks");
  assert.equal(relatedText("habit", 12), "12 days of history");
  assert.equal(relatedText("course", 9), "9 units and topics");
  assert.equal(relatedText("task", 5), ""); // a task has nothing that goes with it
});

test("deleting says it moves to the Archive and can be restored", () => {
  const text = toArchive("“Call the bank”");
  assert.match(text, /move to the Archive/);
  assert.match(text, /restore/);
  assert.doesNotMatch(text, /forever/);
});

test("deleting from the Archive says it is permanent, and how much goes with it", () => {
  assert.equal(foreverMessage("Call the bank", "task", 0), "“Call the bank” will be deleted forever. This cannot be undone.");
  assert.equal(foreverMessage("Learn SQL", "goal", 3), "“Learn SQL” and its 3 milestones will be deleted forever. This cannot be undone.");
  assert.equal(foreverMessage("Bakery site", "project", 1), "“Bakery site” and its 1 task will be deleted forever. This cannot be undone.");
});
