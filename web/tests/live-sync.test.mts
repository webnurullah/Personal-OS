import test from "node:test";
import assert from "node:assert/strict";
import { createBatcher, LIVE_TABLES, prefixesFor, TABLE_PREFIXES, type Timers } from "../lib/live-sync.ts";

// A clock we move by hand.
function fakeTimers() {
  let now = 0;
  let next = 1;
  const waiting = new Map<number, { at: number; fn: () => void }>();
  const timers: Timers = {
    set: (fn, ms) => { const id = next++; waiting.set(id, { at: now + ms, fn }); return id; },
    clear: (id) => { waiting.delete(id as number); },
  };
  const advance = (ms: number) => {
    const end = now + ms;
    for (;;) {
      const due = [...waiting.entries()].filter(([, w]) => w.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      now = due[1].at;
      waiting.delete(due[0]);
      due[1].fn();
    }
    now = end;
  };
  return { timers, advance };
}

test("every table the app listens to has screens to reload, and the Google token table is not listened to", () => {
  for (const table of LIVE_TABLES) assert.ok(TABLE_PREFIXES[table].length > 0, table);
  assert.equal(LIVE_TABLES.includes("google_connections"), false);
  for (const table of ["tasks", "habit_logs", "project_time", "course_time", "learning_resources", "courses", "notes", "transactions", "health_logs", "profiles"]) assert.ok(LIVE_TABLES.includes(table), table);
});

test("changed tables give the screens to reload, each once; an unknown table adds nothing", () => {
  assert.deepEqual(prefixesFor(["habit_logs", "habits"]), ["/habits"]);
  assert.deepEqual(prefixesFor(["course_time", "project_time"]).sort(), ["/courses", "/habits", "/learning", "/project-time", "/projects", "/resources", "/timer"]);
  assert.deepEqual(prefixesFor(["something_else"]), []);
});

test("a burst of changes is reloaded once, after the last one", () => {
  const { timers, advance } = fakeTimers();
  const runs: string[][] = [];
  const batcher = createBatcher((p) => runs.push(p), { timers });
  batcher.push("tasks");
  advance(300);
  batcher.push("habit_logs");
  advance(300);
  assert.equal(runs.length, 0, "still waiting: the second change restarted the wait");
  advance(200);
  assert.equal(runs.length, 1);
  assert.ok(runs[0].includes("/tasks") && runs[0].includes("/habits"));
  advance(5000);
  assert.equal(runs.length, 1, "nothing more");
});

test("while the person is typing in a protected field the reload waits, then runs", () => {
  const { timers, advance } = fakeTimers();
  const runs: string[][] = [];
  let typing = true;
  const batcher = createBatcher((p) => runs.push(p), { timers, busy: () => typing });
  batcher.push("courses");
  advance(400);
  advance(4000);
  assert.equal(runs.length, 0);
  typing = false;
  advance(2000);
  assert.equal(runs.length, 1);
  assert.deepEqual(runs[0].includes("/courses"), true);
});

test("cancel stops a waiting reload", () => {
  const { timers, advance } = fakeTimers();
  const runs: string[][] = [];
  const batcher = createBatcher((p) => runs.push(p), { timers });
  batcher.push("tasks");
  batcher.cancel();
  advance(5000);
  assert.equal(runs.length, 0);
});
