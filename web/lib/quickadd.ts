// Quick Add: short typed commands that are read by rules (no AI), e.g.
//   task call the bank tomorrow !high      note Gift ideas: book, watch
//   remind pay bill friday                 event team meeting 15 oct 3pm-4pm
//   tick Exercise                          done call the bank
//   spent 450 lunch bkash                  earned 20000 salary bank
//   job https://…                          skill react, sql
import { extractDate, extractTime } from "./parse-date.ts";

export type Priority = "low" | "medium" | "high";
export type Method = "bKash" | "Nagad" | "Card" | "Cash" | "Bank" | "Other";

export type Command =
  | { type: "task"; title: string; due_date: string | null; priority: Priority | null }
  | { type: "note"; title: string; body: string }
  | { type: "reminder"; text: string; due_date: string | null }
  | { type: "event"; title: string; event_date: string; start_time: string | null; end_time: string | null }
  | { type: "tick"; name: string }
  | { type: "finish"; query: string }
  | { type: "money"; kind: "expense" | "income"; amount: number; description: string; method: Method; tx_date: string }
  | { type: "job"; url: string }
  | { type: "skills"; skills: string[] }
  | { type: "help" };

export type Parsed = { command: Command } | { error: string } | null;

export const EXAMPLES = [
  { text: "task call the bank tomorrow !high", about: "Add a task" },
  { text: "event team meeting fri 3pm-4pm", about: "Add a calendar event" },
  { text: "remind pay electricity bill 25 oct", about: "Add a reminder" },
  { text: "note Gift ideas: book, watch", about: "Add a note" },
  { text: "done call the bank", about: "Tick a task" },
  { text: "tick Exercise", about: "Tick a habit for today" },
  { text: "spent 450 lunch bkash", about: "Record an expense" },
  { text: "earned 20000 salary bank", about: "Record income" },
  { text: "job https://example.com/jobs/123", about: "Save a job" },
  { text: "skill react, sql, english", about: "Add skills you have" },
];

const METHODS: [RegExp, Method][] = [
  [/\bb-?kash\b/i, "bKash"],
  [/\bnagad\b/i, "Nagad"],
  [/\bcard\b/i, "Card"],
  [/\bcash\b/i, "Cash"],
  [/\bbank\b/i, "Bank"],
];

const clean = (text: string) =>
  text
    .replace(/\s{2,}/g, " ")
    // "call bank on" (left over after a date was taken out)
    .replace(/\s+\b(on|at|by|due|for|before|until|this|next)\b\s*$/i, "")
    .replace(/^\s*(to|that)\s+/i, "")
    .trim();

function takePriority(text: string): { priority: Priority | null; rest: string } {
  const m = text.match(/(?:^|\s)!(high|h|medium|med|m|low|l)\b|\b(high|medium|low)\s+priority\b/i);
  if (!m) return { priority: null, rest: text };
  const word = (m[1] ?? m[2]).toLowerCase();
  const priority = word.startsWith("h") ? "high" : word.startsWith("l") ? "low" : "medium";
  return { priority, rest: clean(text.replace(m[0], " ")) };
}

/** Reads one line. null = not a command (the AI may take it, or a hint is shown). */
export function parseQuickAdd(input: string, today: string): Parsed {
  const line = input.trim().replace(/\s+/g, " ");
  const m = line.match(/^(\w+)[:\s]*([\s\S]*)$/);
  if (!m) return null;
  const word = m[1].toLowerCase();
  const text = m[2].trim();

  switch (word) {
    case "help":
    case "commands":
      return { command: { type: "help" } };

    case "task":
    case "todo": {
      const { priority, rest } = takePriority(text);
      const date = extractDate(rest, today);
      const title = clean(date?.rest ?? rest);
      if (!title) return { error: "What is the task? e.g. task call the bank tomorrow !high" };
      return { command: { type: "task", title, due_date: date?.value ?? null, priority } };
    }

    case "note": {
      if (!text) return { error: "What is the note? e.g. note Gift ideas: book, watch" };
      const split = text.indexOf(":");
      const title = (split > 0 ? text.slice(0, split) : text).trim();
      const body = split > 0 ? text.slice(split + 1).trim() : "";
      return { command: { type: "note", title: title.slice(0, 200), body } };
    }

    case "remind":
    case "reminder": {
      const date = extractDate(text, today);
      const body = clean(date?.rest ?? text);
      if (!body) return { error: "What should I remind you about? e.g. remind pay bill friday" };
      return { command: { type: "reminder", text: body, due_date: date?.value ?? null } };
    }

    case "event": {
      const date = extractDate(text, today);
      const time = extractTime(date?.rest ?? text);
      const title = clean(time?.rest ?? date?.rest ?? text);
      if (!title) return { error: "What is the event? e.g. event team meeting fri 3pm-4pm" };
      const start = time?.value.start ?? null;
      let end = time?.value.end ?? null;
      // A start time with no end: one hour. An end before the start is dropped.
      if (start && !end) end = addHour(start);
      if (start && end && end <= start) end = addHour(start);
      if (!start) end = null;
      return { command: { type: "event", title, event_date: date?.value ?? today, start_time: start, end_time: end } };
    }

    case "tick":
    case "habit": {
      if (!text) return { error: "Which habit? e.g. tick Exercise" };
      return { command: { type: "tick", name: text } };
    }

    case "done":
    case "finish":
    case "complete": {
      if (!text) return { error: "Which task? e.g. done call the bank" };
      return { command: { type: "finish", query: text } };
    }

    case "spent":
    case "spend":
    case "expense":
    case "paid":
    case "earned":
    case "income":
    case "received": {
      const kind = ["earned", "income", "received"].includes(word) ? "income" : "expense";
      const date = extractDate(text, today, { future: false });
      let rest = date?.rest ?? text;
      let method: Method = "Cash";
      for (const [re, name] of METHODS) {
        if (re.test(rest)) {
          method = name;
          rest = rest.replace(re, " ");
          break;
        }
      }
      const amount = rest.match(/(?:৳|tk\.?|bdt|\$)?\s*(\d[\d,]*(?:\.\d+)?)\s*(?:tk|taka|৳|bdt|usd)?/i);
      const value = amount ? Number(amount[1].replace(/,/g, "")) : NaN;
      if (!amount || !(value > 0)) return { error: `How much? e.g. ${kind === "income" ? "earned 20000 salary bank" : "spent 450 lunch bkash"}` };
      const description = clean(rest.replace(amount[0], " ").replace(/\b(tk|taka|on|for|via|by|with|using)\b/gi, " ")) || (kind === "income" ? "Income" : "Expense");
      return { command: { type: "money", kind, amount: value, description: description.slice(0, 200), method, tx_date: date?.value ?? today } };
    }

    case "job": {
      const url = text.match(/https?:\/\/\S+/i)?.[0];
      if (!url) return { error: "Paste the job link, e.g. job https://example.com/jobs/123" };
      return { command: { type: "job", url } };
    }

    case "skill":
    case "skills": {
      const skills = text.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
      if (!skills.length) return { error: "Which skills? e.g. skill react, sql, english" };
      return { command: { type: "skills", skills } };
    }

    default:
      return null;
  }
}

function addHour(hhmm: string) {
  const h = Number(hhmm.slice(0, 2)) + 1;
  // Past midnight: end at 23:59.
  return h > 23 ? "23:59" : `${String(h).padStart(2, "0")}:${hhmm.slice(3, 5)}`;
}
