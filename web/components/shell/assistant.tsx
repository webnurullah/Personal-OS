"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Bot, Eraser, SendHorizontal, Sparkles, X } from "lucide-react";
import { api, errorMessage, refreshAll } from "@/lib/api";

type Message = { role: "user" | "assistant"; content: string; error?: boolean };

const STORAGE_KEY = "pos-assistant-v1";
// The server gets the most recent messages only, so long chats stay fast.
const HISTORY = 30;

const SUGGESTIONS = [
  "What's on my plate today?",
  "Add a task: call the bank tomorrow, high priority",
  "Add a note “Gift ideas” with: book, watch",
  "Mark topic 1.3 of my course as done",
  "Which skills should I learn for my saved jobs?",
];

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

/** The chat assistant: a button in the corner of every page that opens a chat panel. */
export function Assistant() {
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

  const send = async (content: string) => {
    const question = content.trim();
    if (!question || busy) return;
    const next: Message[] = [...messages, { role: "user", content: question }];
    setMessages(next);
    setText("");
    setBusy(true);
    try {
      const history = next.filter((m) => !m.error).slice(-HISTORY).map(({ role, content }) => ({ role, content }));
      // The server needs the conversation to start with a user message.
      while (history.length && history[0].role !== "user") history.shift();
      const answer = await api<{ reply: string; changed: boolean }>("/assistant", { method: "POST", body: { messages: history } });
      setMessages((m) => [...m, { role: "assistant", content: answer.reply }]);
      if (answer.changed) await refreshAll();
    } catch (error) {
      setMessages((m) => [...m, { role: "assistant", content: errorMessage(error), error: true }]);
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    send(text);
  };

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-30 flex items-center gap-2 rounded-full bg-linear-to-br from-blue-600 to-indigo-600 py-3 pl-4 pr-5 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 transition hover:shadow-xl hover:shadow-blue-600/40"
          aria-label="Open the assistant (Ctrl+J)"
          title="Assistant (Ctrl+J)"
        >
          <Sparkles className="size-5" />
          Ask POS
        </button>
      )}

      {open && (
        <section
          className="fixed inset-0 z-50 flex flex-col bg-white shadow-2xl sm:inset-auto sm:bottom-5 sm:right-5 sm:h-[min(42rem,calc(100dvh-2.5rem))] sm:w-[26rem] sm:rounded-2xl sm:ring-1 sm:ring-slate-200"
          aria-label="Assistant"
        >
          <header className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
            <span className="grid size-9 place-items-center rounded-xl bg-linear-to-br from-blue-600 to-indigo-600 text-white">
              <Bot className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-slate-900">POS Assistant</h2>
              <p className="text-xs text-slate-500">Adds, changes and finds anything for you</p>
            </div>
            {messages.length > 0 && (
              <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => setMessages([])} aria-label="New chat" title="New chat">
                <Eraser className="size-4" />
              </button>
            )}
            <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => setOpen(false)} aria-label="Close assistant">
              <X className="size-5" />
            </button>
          </header>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
            {!messages.length && (
              <div>
                <p className="text-sm text-slate-600">Hi! Tell me what to do, in English or বাংলা. For example:</p>
                <ul className="mt-3 space-y-2">
                  {SUGGESTIONS.map((s) => (
                    <li key={s}>
                      <button type="button" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-left text-sm text-slate-700 transition hover:border-blue-200 hover:bg-blue-50" onClick={() => send(s)}>
                        {s}
                      </button>
                    </li>
                  ))}
                </ul>
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
                placeholder="Ask or tell me anything…"
                className="max-h-32 min-h-6 flex-1 resize-none bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400 field-sizing-content"
              />
              <button type="submit" className="btn btn-primary btn-sm btn-icon" disabled={busy || !text.trim()} aria-label="Send">
                <SendHorizontal className="size-4" />
              </button>
            </div>
            <p className="mt-1.5 text-center text-[11px] text-slate-400">Enter to send · Shift+Enter for a new line · Ctrl+J to open</p>
          </form>
        </section>
      )}
    </>
  );
}
