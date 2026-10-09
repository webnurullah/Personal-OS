// Quick Add commands and the date/time reader. Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { extractDate, extractTime } from "../lib/parse-date.ts";
import { parseQuickAdd } from "../lib/quickadd.ts";

const today = "2026-10-06"; // a Tuesday
const cmd = (text: string) => {
  const parsed = parseQuickAdd(text, today);
  assert.ok(parsed && "command" in parsed, `"${text}" should be a command, got ${JSON.stringify(parsed)}`);
  return parsed.command;
};

test("dates in plain words", () => {
  assert.equal(extractDate("pay bill tomorrow", today)?.value, "2026-10-07");
  assert.equal(extractDate("2026-12-01", today)?.value, "2026-12-01");
  assert.equal(extractDate("deadline 15/10/2026", today)?.value, "2026-10-15"); // day first
  assert.equal(extractDate("by Oct 20, 2026", today)?.value, "2026-10-20");
  assert.equal(extractDate("20-Oct-2026", today)?.value, "2026-10-20");
  assert.equal(extractDate("20 oct", today)?.value, "2026-10-20");
  assert.equal(extractDate("3 jan", today)?.value, "2027-01-03"); // already passed: next year
  assert.equal(extractDate("3 jan", today, { future: false })?.value, "2026-01-03");
  assert.equal(extractDate("in 2 weeks", today)?.value, "2026-10-20");
  assert.equal(extractDate("next monday", today)?.value, "2026-10-12");
  assert.equal(extractDate("tuesday", today)?.value, "2026-10-13"); // on a Tuesday: the next one
  assert.equal(extractDate("31 feb", today), null); // not a real day
  assert.equal(extractDate("nothing here", today), null);
  assert.equal(extractDate("call bank tomorrow please", today)?.rest, "call bank please");
});

test("times and time ranges", () => {
  assert.deepEqual(extractTime("at 3pm")?.value, { start: "15:00", end: null });
  assert.deepEqual(extractTime("lunch 1:30 pm")?.value, { start: "13:30", end: null });
  assert.deepEqual(extractTime("standup 09:15")?.value, { start: "09:15", end: null });
  assert.deepEqual(extractTime("3pm-4:30pm")?.value, { start: "15:00", end: "16:30" });
  assert.deepEqual(extractTime("3-4pm")?.value, { start: "15:00", end: "16:00" });
  assert.deepEqual(extractTime("10:00 to 11:30")?.value, { start: "10:00", end: "11:30" });
  assert.deepEqual(extractTime("12am")?.value, { start: "00:00", end: null });
  assert.equal(extractTime("buy 2 apples"), null); // a bare number is not a time
  assert.equal(extractTime("read 10-12 pages"), null);
});

test("task", () => {
  assert.deepEqual(cmd("task call the bank tomorrow !high"), { type: "task", title: "call the bank", due_date: "2026-10-07", priority: "high" });
  assert.deepEqual(cmd("Task: buy milk"), { type: "task", title: "buy milk", due_date: null, priority: null });
  assert.deepEqual(cmd("todo finish report on friday low priority"), { type: "task", title: "finish report", due_date: "2026-10-09", priority: "low" });
});

test("event", () => {
  assert.deepEqual(cmd("event team meeting fri 3pm-4pm"), { type: "event", title: "team meeting", event_date: "2026-10-09", start_time: "15:00", end_time: "16:00" });
  assert.deepEqual(cmd("event lunch with Rahim 15 oct 1:30pm"), { type: "event", title: "lunch with Rahim", event_date: "2026-10-15", start_time: "13:30", end_time: "14:30" });
  assert.deepEqual(cmd("event Eid holiday 20 oct"), { type: "event", title: "Eid holiday", event_date: "2026-10-20", start_time: null, end_time: null });
  assert.equal((cmd("event gym 11pm") as { end_time: string }).end_time, "23:59");
});

test("reminder and note", () => {
  assert.deepEqual(cmd("remind pay electricity bill 25 oct"), { type: "reminder", text: "pay electricity bill", due_date: "2026-10-25" });
  assert.deepEqual(cmd("note Gift ideas: book, watch"), { type: "note", title: "Gift ideas", body: "book, watch" });
  assert.deepEqual(cmd("note just a title"), { type: "note", title: "just a title", body: "" });
});

test("money", () => {
  assert.deepEqual(cmd("spent 450 lunch bkash"), { type: "money", kind: "expense", amount: 450, description: "lunch", method: "bKash", tx_date: today });
  assert.deepEqual(cmd("earned 20,000 salary bank"), { type: "money", kind: "income", amount: 20000, description: "salary", method: "Bank", tx_date: today });
  assert.deepEqual(cmd("spent ৳1,200.50 on groceries yesterday"), { type: "money", kind: "expense", amount: 1200.5, description: "groceries", method: "Cash", tx_date: "2026-10-05" });
  assert.deepEqual(cmd("spent 80 tk rickshaw"), { type: "money", kind: "expense", amount: 80, description: "rickshaw", method: "Cash", tx_date: today });
});

test("tick, done, job, skills, help", () => {
  assert.deepEqual(cmd("tick Exercise"), { type: "tick", name: "Exercise" });
  assert.deepEqual(cmd("done call the bank"), { type: "finish", query: "call the bank" });
  assert.deepEqual(cmd("job https://jobs.example.com/frontend-123?ref=x"), { type: "job", url: "https://jobs.example.com/frontend-123?ref=x" });
  assert.deepEqual(cmd("skill react, SQL ,english"), { type: "skills", skills: ["react", "SQL", "english"] });
  assert.deepEqual(cmd("help"), { type: "help" });
});

test("not a command, or a command with something missing", () => {
  assert.equal(parseQuickAdd("what's on my plate today?", today), null);
  assert.equal(parseQuickAdd("hello", today), null);
  assert.ok("error" in (parseQuickAdd("task", today) ?? {}));
  assert.ok("error" in (parseQuickAdd("spent lunch", today) ?? {}));
  assert.ok("error" in (parseQuickAdd("job example.com", today) ?? {}));
});

test("study: time and words, a day, and what is refused", () => {
  assert.deepEqual(cmd("study 1h sql joins"), { type: "study", hours: 1, text: "sql joins", date: today });
  assert.deepEqual(cmd("study sql joins 90m"), { type: "study", hours: 1.5, text: "sql joins", date: today });
  assert.deepEqual(cmd("studied 1h30m excel pivot tables"), { type: "study", hours: 1.5, text: "excel pivot tables", date: today });
  assert.deepEqual(cmd("study 2 hours seo yesterday"), { type: "study", hours: 2, text: "seo", date: "2026-10-05" });
  assert.deepEqual(cmd("study 45 min"), { type: "study", hours: 0.75, text: "", date: today });
  assert.deepEqual(cmd("study 0,5h english"), { type: "study", hours: 0.5, text: "english", date: today });
  assert.ok("error" in (parseQuickAdd("study sql joins", today) ?? {}), "no time");
  assert.ok("error" in (parseQuickAdd("study 5m sql", today) ?? {}), "under 15 minutes");
  assert.ok("error" in (parseQuickAdd("study 25h sql", today) ?? {}), "over a day");
  assert.ok("error" in (parseQuickAdd("study", today) ?? {}));
  // A number that is not a time stays in the words.
  assert.deepEqual(cmd("study 1h chapter 3 of sql 101"), { type: "study", hours: 1, text: "chapter 3 of sql 101", date: today });
});

test("course: a link to add to the library", () => {
  assert.deepEqual(cmd("course https://www.coursera.org/learn/seo"), { type: "course", url: "https://www.coursera.org/learn/seo" });
  assert.deepEqual(cmd("playlist https://www.youtube.com/playlist?list=PL123"), { type: "course", url: "https://www.youtube.com/playlist?list=PL123" });
  assert.ok("error" in (parseQuickAdd("course seo basics", today) ?? {}));
});
