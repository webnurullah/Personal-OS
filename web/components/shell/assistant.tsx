"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import useSWR from "swr";
import { Bot, Eraser, SendHorizontal, Sparkles, X } from "lucide-react";
import { api, errorMessage, refresh, refreshAll } from "@/lib/api";
import { formatDate } from "@/lib/dates";
import { saveJobFromLink } from "@/lib/job-actions";
import { skillKey } from "@/lib/jobs";
import { formatTime } from "@/lib/format";
import { useProfile } from "@/lib/profile";
import { EXAMPLES, parseQuickAdd, type Command } from "@/lib/quickadd";
import type { BudgetCategory, FinanceMonth, HabitsResponse, List, Task } from "@/lib/types";

type Message = { role: "user" | "assistant"; content: string; error?: boolean };

const STORAGE_KEY = "pos-assistant-v1";
// The AI gets the most recent messages only, so long chats stay fast.
const HISTORY = 30;

function load(): Message[] {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]") as Message[];
  } catch {
    return [];
  }
}

/** **bold** inside a line. */
function inline(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part));
}

/** Just enough Markdown for chat: paragraphs, "- " / "1. " lists and **bold** (no HTML is ever injected). */
function Rich({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const items = list.items.map((item, i) => <li key={i}>{inline(item)}</li>);
    out.push(list.ordered ? <ol key={out.length} className="list-decimal space-y-0.5 pl-5">{items}</ol> : <ul key={out.length} className="list-disc space-y-0.5 pl-5">{items}</ul>);
    list = null;
  };
  for (const line of text.split("\n")) {
    const bullet = line.match(/^\s*[-*•]\s+(.*)/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)/);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      if (list && list.ordered !== ordered) flush();
      list ??= { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
      continue;
    }
    flush();
    if (line.trim()) out.push(<p key={out.length}>{inline(line.replace(/^#+\s*/, ""))}</p>);
  }
  flush();
  return <div className="space-y-1.5">{out}</div>;
}

const HELP = `Type a short command:\n${EXAMPLES.map((e) => `- **${e.text}** — ${e.about}`).join("\n")}\n\nDates: today, tomorrow, friday, next monday, 15 oct, 2026-10-15, in 3 days. Times: 3pm, 3:30pm, 15:00, 3pm-4pm.`;

/** The Quick Add bar: typed commands are read by rules and run at once; other text goes to the AI when it is set up. */
export function Assistant() {
  const { profile, money } = useProfile();
  const { data: status } = useSWR<{ ai: boolean }>("/assistant");
  const ai = Boolean(status?.ai);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>(load);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-60)));
    } catch {
      // Storage blocked: the chat still works for this visit.
    }
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, busy]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  /** Runs one command through the same API as the pages, and answers what it did. */
  const run = async (c: Command, today: string): Promise<string> => {
    const clock = (hhmm: string) => formatTime(hhmm, profile?.time_format ?? "12h");
    switch (c.type) {
      case "help":
        return HELP;

      case "task": {
        await api("/tasks", { method: "POST", body: { title: c.title, ...(c.due_date ? { due_date: c.due_date } : {}), ...(c.priority ? { priority: c.priority } : {}) } });
        await refresh("/tasks");
        return `Added task **${c.title}**${c.due_date ? ` for ${formatDate(c.due_date, "short")}` : ""}${c.priority ? `, ${c.priority} priority` : ""}.`;
      }

      case "note":
        await api("/notes", { method: "POST", body: { title: c.title, body: c.body } });
        await refresh("/notes");
        return `Added note **${c.title}**.`;

      case "reminder":
        await api("/reminders", { method: "POST", body: { text: c.text, ...(c.due_date ? { due_date: c.due_date } : {}) } });
        await refresh("/reminders");
        return `Reminder added: **${c.text}**${c.due_date ? ` (${formatDate(c.due_date, "short")})` : ""}.`;

      case "event": {
        const timed = Boolean(c.start_time && c.end_time);
        await api("/events", { method: "POST", body: { title: c.title, event_date: c.event_date, all_day: !timed, ...(timed ? { start_time: c.start_time, end_time: c.end_time } : {}) } });
        await refresh("/events");
        return `Added event **${c.title}** on ${formatDate(c.event_date, "short")}${timed ? `, ${clock(c.start_time!)} – ${clock(c.end_time!)}` : " (all day)"}.`;
      }

      case "tick": {
        const habits = await api<HabitsResponse>("/habits?days=7");
        const q = c.name.toLowerCase();
        const matches = habits.items.filter((h) => h.name.toLowerCase() === q);
        const found = matches.length ? matches : habits.items.filter((h) => h.name.toLowerCase().includes(q) || q.includes(h.name.toLowerCase()));
        if (found.length !== 1) {
          const names = habits.items.map((h) => h.name);
          return found.length > 1
            ? `More than one habit matches: ${found.map((h) => `**${h.name}**`).join(", ")}. Type the full name.`
            : names.length ? `I could not find a habit called **${c.name}**. Your habits: ${names.map((n) => `**${n}**`).join(", ")}.` : "You have no habits yet. Add one on the Habits page first.";
        }
        await api(`/habits/${found[0].id}/logs/${today}`, { method: "PUT" });
        await refresh("/habits");
        return `Ticked **${found[0].name}** for today.`;
      }

      case "finish": {
        const tasks = await api<List<Task>>("/tasks");
        const q = c.query.toLowerCase();
        const open = tasks.items.filter((t) => !t.done_at && t.title.toLowerCase().includes(q));
        const exact = open.filter((t) => t.title.toLowerCase() === q);
        const found = exact.length === 1 ? exact : open;
        if (found.length !== 1) return found.length ? `More than one task matches: ${found.slice(0, 5).map((t) => `**${t.title}**`).join(", ")}. Type more of the name.` : `No open task matches **${c.query}**.`;
        await api(`/tasks/${found[0].id}`, { method: "PATCH", body: { done: true } });
        await refresh("/tasks");
        return `Done: **${found[0].title}**.`;
      }

      case "money": {
        let category: BudgetCategory | undefined;
        if (c.kind === "expense") {
          const month = await api<FinanceMonth>("/finance");
          const text = c.description.toLowerCase();
          category = month.categories.find((b) => text.includes(b.name.toLowerCase()));
        }
        await api("/finance/transactions", {
          method: "POST",
          body: { type: c.kind, amount: c.amount, description: c.description, method: c.method, tx_date: c.tx_date, ...(category ? { budget_category_id: category.id } : {}) },
        });
        await refresh("/finance");
        return `Recorded ${c.kind === "income" ? "income" : "expense"} of **${money(c.amount)}** — ${c.description} (${c.method})${category ? `, under ${category.name}` : ""}.`;
      }

      case "job": {
        const { job, analysis } = await saveJobFromLink(c.url);
        await refresh("/jobs", "/events");
        const found = [job.deadline ? `apply by **${formatDate(job.deadline, "short")}**` : "no last date found", `${job.skills.length} ${job.skills.length === 1 ? "skill" : "skills"}`];
        return `Saved **${job.title}**${job.company ? ` at ${job.company}` : ""}: ${found.join(", ")}.${analysis.by === "rules" || !job.deadline ? " Open Job Apply to check the details." : ""}`;
      }

      case "skills": {
        const have = profile?.skills ?? [];
        const fresh = c.skills.filter((s) => !have.some((k) => skillKey(k) === skillKey(s)));
        if (!fresh.length) return "You already have those skills listed.";
        await api("/profile", { method: "PATCH", body: { skills: [...have, ...fresh] } });
        await refresh("/profile");
        return `Added skills: ${fresh.map((s) => `**${s}**`).join(", ")}.`;
      }
    }
  };

  const send = async (content: string) => {
    const question = content.trim();
    if (!question || busy) return;
    const next: Message[] = [...messages, { role: "user", content: question }];
    setMessages(next);
    setText("");
    setBusy(true);
    const reply = (message: Message) => setMessages((m) => [...m, message]);
    try {
      const parsed = parseQuickAdd(question, profile?.today ?? new Date().toLocaleDateString("en-CA"));
      if (parsed && "error" in parsed) {
        reply({ role: "assistant", content: parsed.error });
      } else if (parsed) {
        reply({ role: "assistant", content: await run(parsed.command, profile?.today ?? new Date().toLocaleDateString("en-CA")) });
      } else if (ai) {
        const history = next.filter((m) => !m.error).slice(-HISTORY).map(({ role, content }) => ({ role, content }));
        // The server needs the conversation to start with a user message.
        while (history.length && history[0].role !== "user") history.shift();
        const answer = await api<{ reply: string; changed: boolean }>("/assistant", { method: "POST", body: { messages: history } });
        reply({ role: "assistant", content: answer.reply });
        if (answer.changed) await refreshAll();
      } else {
        reply({ role: "assistant", content: `I did not understand that. Start with a word like **task**, **event**, **note**, **remind**, **spent**, **tick** or **job**. Type **help** to see examples.` });
      }
    } catch (error) {
      reply({ role: "assistant", content: errorMessage(error), error: true });
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    send(text);
  };

  const title = ai ? "POS Assistant" : "Quick Add";

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-4 right-4 z-30 grid size-13 place-items-center rounded-full bg-linear-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/30 transition hover:scale-105 hover:shadow-xl hover:shadow-blue-600/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 sm:bottom-5 sm:right-5 sm:size-14"
          aria-label={`Open ${title} (Ctrl+J)`}
          title={`${title} (Ctrl+J)`}
        >
          <Sparkles className="size-6" />
        </button>
      )}

      {open && (
        <section
          className="fixed inset-0 z-50 flex flex-col bg-white shadow-2xl sm:inset-auto sm:bottom-5 sm:right-5 sm:h-[min(42rem,calc(100dvh-2.5rem))] sm:w-[26rem] sm:rounded-2xl sm:ring-1 sm:ring-slate-200"
          aria-label={title}
        >
          <header className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
            <span className="grid size-9 place-items-center rounded-xl bg-linear-to-br from-blue-600 to-indigo-600 text-white">
              <Bot className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
              <p className="text-xs text-slate-500">{ai ? "Type a command, or ask in your own words" : "Type a short command and it is done"}</p>
            </div>
            {messages.length > 0 && (
              <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => setMessages([])} aria-label="Clear chat" title="Clear chat">
                <Eraser className="size-4" />
              </button>
            )}
            <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => setOpen(false)} aria-label="Close">
              <X className="size-5" />
            </button>
          </header>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
            {!messages.length && (
              <div>
                <p className="text-sm text-slate-600">Add things without opening a page. Tap an example, change it, and press Enter:</p>
                <ul className="mt-3 space-y-2">
                  {EXAMPLES.map((e) => (
                    <li key={e.text}>
                      <button
                        type="button"
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-left transition hover:border-blue-200 hover:bg-blue-50"
                        onClick={() => {
                          setText(e.text);
                          inputRef.current?.focus();
                        }}
                      >
                        <span className="block text-sm font-medium text-slate-800">{e.text}</span>
                        <span className="block text-xs text-slate-500">{e.about}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                {ai && <p className="mt-3 text-xs text-slate-500">The AI is on: you can also ask things like “What’s on my plate today?”</p>}
              </div>
            )}
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="ml-10 whitespace-pre-wrap rounded-2xl rounded-br-md bg-blue-600 px-3.5 py-2 text-sm text-white">{m.content}</div>
              ) : (
                <div key={i} className={`mr-6 rounded-2xl rounded-bl-md px-3.5 py-2 text-sm ${m.error ? "bg-rose-50 text-rose-700" : "bg-slate-100 text-slate-800"}`}>
                  <Rich text={m.content} />
                </div>
              ),
            )}
            {busy && (
              <div className="mr-6 inline-flex items-center gap-1 rounded-2xl rounded-bl-md bg-slate-100 px-4 py-3" aria-label="Working">
                {[0, 150, 300].map((d) => <span key={d} className="size-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: `${d}ms` }} />)}
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form onSubmit={submit} className="border-t border-slate-100 p-3">
            <div className="flex items-end gap-2 rounded-xl border border-slate-200 px-3 py-2 focus-within:border-blue-300 focus-within:ring-2 focus-within:ring-blue-100">
              <textarea
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(text);
                  }
                }}
                rows={1}
                maxLength={20000}
                placeholder={ai ? "task call the bank tomorrow, or ask anything…" : "task call the bank tomorrow !high"}
                className="max-h-32 min-h-6 flex-1 resize-none bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400 field-sizing-content"
              />
              <button type="submit" className="btn btn-primary btn-sm btn-icon" disabled={busy || !text.trim()} aria-label="Send">
                <SendHorizontal className="size-4" />
              </button>
            </div>
            <p className="mt-1.5 text-center text-[11px] text-slate-400">Enter to send · type <b>help</b> for examples · Ctrl+J to open</p>
          </form>
        </section>
      )}
    </>
  );
}
