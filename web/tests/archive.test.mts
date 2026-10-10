// The Archive: names, what goes with an item, and the confirmation texts. Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { ARCHIVE_KINDS, foreverMessage, kindName, relatedText, toArchive } from "../lib/archive.ts";

// Every kind the database function knows (supabase/migrations: archive_items.sql, and later migrations that add kinds) has a name and a home page.
const DATABASE_KINDS = ["task", "note", "event", "goal", "milestone", "habit", "course", "unit", "topic", "study_block", "transaction", "bill", "budget_category", "category", "reminder", "job", "resource", "company"];

// The newest migration that (re)defines something is the one in force.
const migrations = new URL("../../supabase/migrations/", import.meta.url);
const files = readdirSync(migrations).filter((f) => f.endsWith(".sql")).sort();
const newest = (what: RegExp) => {
  const hits = files.map((f) => readFileSync(new URL(f, migrations), "utf8")).filter((sql) => what.test(sql));
  assert.ok(hits.length > 0, `no migration matches ${what}`);
  return hits[hits.length - 1];
};

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
  const sql = newest(/kind in \(\s*'task'/);
  const inCheck = sql.match(/kind in \(\s*('task'[^)]*)\)/)?.[1].match(/'([a-z_]+)'/g)?.map((k) => k.replaceAll("'", "")) ?? [];
  assert.deepEqual([...inCheck].sort(), [...DATABASE_KINDS].sort());
  // …and so does archive_config, which says where each kind lives.
  const config = JSON.parse(newest(/function public\.archive_config/).match(/select \('(\{[\s\S]*?\})'::jsonb\)/)?.[1] ?? "{}") as Record<string, { table: string }>;
  assert.deepEqual(Object.keys(config).sort(), [...DATABASE_KINDS].sort());
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

test("the SQL file for the Supabase SQL Editor has exactly the same functions as the migration", () => {
  const body = (sql: string, name: string) => {
    const start = sql.search(new RegExp(`create (or replace )?function public\\.${name}\\(`));
    assert.ok(start >= 0, `${name} not found`);
    const end = sql.indexOf("end $$;", start);
    return sql.slice(start, end).replace("create or replace function", "create function").replace(/\s+/g, " ");
  };
  const migration = readFileSync(new URL("../../supabase/migrations/20261008000100_archive_items.sql", import.meta.url), "utf8");
  const paste = readFileSync(new URL("../../supabase/archive-step-2.sql", import.meta.url), "utf8");
  for (const name of ["archive_delete", "archive_restore"]) assert.equal(body(paste, name), body(migration, name), name);
  // Part 2 of the file is the newest migration, word for word.
  const fixes = readFileSync(new URL("../../supabase/migrations/20261009000100_archive_fixes.sql", import.meta.url), "utf8");
  assert.ok(paste.includes(fixes.trim()), "the fixes migration is not inside archive-step-2.sql");
});
