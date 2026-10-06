"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import useSWR from "swr";
import { Banknote, CalendarDays, CalendarPlus, CircleDot, FileText, FolderKanban, GraduationCap, HeartPulse, NotebookPen, PiggyBank, Plus, Repeat, Search, SquareCheck, Target, Timer, type LucideIcon } from "lucide-react";
import { formatDate } from "@/lib/dates";
import type { SearchItem } from "@/lib/types";
import { ARCHIVE_NAV, NAV, SETTINGS_NAV } from "./nav";

type Command = { group: string; label: string; href: string; icon: LucideIcon; hint?: string; action?: boolean };

const COMMANDS: Command[] = [
  ...[...NAV, SETTINGS_NAV, ARCHIVE_NAV].map((n) => ({ group: "Pages", label: n.label, href: n.href, icon: n.icon })),
  { group: "Quick actions", label: "New task", href: "/tasks", icon: Plus, action: true },
  { group: "Quick actions", label: "New project", href: "/projects", icon: FolderKanban, action: true },
  { group: "Quick actions", label: "New event", href: "/calendar", icon: CalendarPlus, action: true },
  { group: "Quick actions", label: "Log a study session", href: "/learning", icon: Timer, action: true },
  { group: "Quick actions", label: "Add a transaction", href: "/finance", icon: Banknote, action: true },
  { group: "Quick actions", label: "Log today's health", href: "/health", icon: HeartPulse, action: true },
  { group: "Quick actions", label: "New note", href: "/notes", icon: NotebookPen, action: true },
  { group: "Quick actions", label: "New goal", href: "/goals", icon: Target, action: true },
  { group: "Quick actions", label: "New habit", href: "/habits", icon: Repeat, action: true },
];

const RESULT_ICONS: Record<string, LucideIcon> = {
  Task: SquareCheck, Note: FileText, Goal: Target, Event: CalendarDays, Habit: Repeat, Course: GraduationCap, Transaction: PiggyBank, Project: FolderKanban,
};

/** Ctrl+K: jump to a page, start a quick action, or search your data. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const ref = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [active, setActive] = useState(0);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setQuery("");
      setActive(0);
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const { data } = useSWR<{ items: SearchItem[] }>(open && debounced.length >= 2 ? `/search?q=${encodeURIComponent(debounced)}` : null);

  const items = useMemo<Command[]>(() => {
    const q = query.trim().toLowerCase();
    const local = COMMANDS.filter((c) => !q || `${c.label} ${c.group}`.toLowerCase().includes(q));
    const results = q.length >= 2 ? (data?.items ?? []).map((r) => ({ group: "Results", label: r.title, href: r.href, hint: `${r.type} · ${/^\d{4}-\d{2}-\d{2}$/.test(r.hint) ? formatDate(r.hint, "date") : r.hint}`, icon: RESULT_ICONS[r.type] ?? CircleDot })) : [];
    return [...local, ...results];
  }, [query, data]);

  const run = (command: Command | undefined) => {
    if (!command) return;
    onClose();
    if (command.action && pathname === command.href) window.dispatchEvent(new Event("pos:new"));
    else router.push(command.action ? `${command.href}?new=1` : command.href);
  };

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label="Search"
      className="mb-auto mt-[10vh] w-[calc(100%-2rem)] max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl"
    >
      <div className="flex items-center gap-3 border-b border-slate-100 px-4">
        <Search className="size-5 shrink-0 text-slate-400" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              const step = e.key === "ArrowDown" ? 1 : -1;
              setActive((i) => (i + step + items.length) % Math.max(items.length, 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              run(items[active]);
            }
          }}
          autoFocus
          placeholder="Search pages, actions, tasks, notes…"
          className="h-14 min-w-0 flex-1 bg-transparent text-[15px] text-slate-800 outline-none placeholder:text-slate-400"
        />
        <kbd className="rounded-md border border-slate-200 px-1.5 py-0.5 font-sans text-[11px] text-slate-500 max-sm:hidden">Esc</kbd>
      </div>
      <ul role="listbox" className="max-h-[55vh] overflow-y-auto p-2">
        {items.length === 0 && <li className="px-3 py-10 text-center text-sm text-slate-500">{debounced.length >= 2 && !data ? "Searching…" : `No results for “${query}”`}</li>}
        {items.map((item, i) => {
          const heading = i === 0 || items[i - 1].group !== item.group ? item.group : null;
          return (
            <li key={`${item.group}-${item.label}-${i}`}>
              {heading && <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{heading}</p>}
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                onMouseMove={() => setActive(i)}
                onClick={() => run(item)}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-slate-700 aria-selected:bg-blue-50 aria-selected:text-blue-700"
              >
                <item.icon className="size-4.5 shrink-0 text-slate-400" />
                <span className="min-w-[40%] flex-1 truncate">{item.label}</span>
                {item.hint && <span className="max-w-[45%] shrink-0 truncate text-xs text-slate-400">{item.hint}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center gap-5 border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500 max-sm:hidden">
        <span>
          <kbd className="font-sans font-semibold">↑ ↓</kbd> move
        </span>
        <span>
          <kbd className="font-sans font-semibold">Enter</kbd> open
        </span>
        <span className="ml-auto">Searches all your data</span>
      </div>
    </dialog>
  );
}
