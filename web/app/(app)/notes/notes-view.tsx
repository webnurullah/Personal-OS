"use client";

import { toArchive } from "@/lib/archive";
import { useState, type FormEvent, type ReactNode } from "react";
import useSWR from "swr";
import { BellRing, NotebookPen, Pin, Plus, Search, Trash2 } from "lucide-react";
import { api, errorMessage, refresh } from "@/lib/api";
import { colorOf, PICKER_COLORS } from "@/lib/colors";
import { daysBetween, formatDate, relativeDay } from "@/lib/dates";
import { plural } from "@/lib/format";
import { useNewAction } from "@/lib/new-action";
import { useProfile } from "@/lib/profile";
import type { List, Note, Reminder } from "@/lib/types";
import { ColorPicker, Field } from "@/components/ui/controls";
import { useFeedback } from "@/components/ui/feedback";
import { Modal, ModalActions } from "@/components/ui/modal";
import { EmptyState, LoadError, PageHeader, PageSkeleton } from "@/components/ui/states";

const NOTE_COLORS = ["white", ...PICKER_COLORS] as const;

/** The calendar day of a timestamp in your time zone. */
function dayOf(timestamp: string, timeZone = "Asia/Dhaka") {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(timestamp));
  } catch {
    return timestamp.slice(0, 10);
  }
}

/**
 * Shows a note's text: lines starting with "- " become a bulleted list,
 * "1. " a numbered list, everything else a paragraph.
 */
function NoteBody({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const items = list.items.map((item, i) => <li key={i}>{item}</li>);
    blocks.push(
      list.ordered ? (
        <ol key={blocks.length} className="list-decimal space-y-1 pl-5">{items}</ol>
      ) : (
        <ul key={blocks.length} className="list-disc space-y-1 pl-5">{items}</ul>
      ),
    );
    list = null;
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const numbered = line.match(/^\d+[.)]\s+(.*)$/);
    const item = line.match(/^[-*•]\s+(.*)$/) ?? numbered;
    if (item) {
      const ordered = Boolean(numbered);
      if (list && list.ordered !== ordered) flush();
      list ??= { ordered, items: [] };
      list.items.push(item[1]);
    } else {
      flush();
      if (line) blocks.push(<p key={blocks.length}>{line}</p>);
    }
  }
  flush();
  return <div className="mt-2 space-y-2 whitespace-pre-line break-words text-sm leading-relaxed text-slate-700">{blocks}</div>;
}

export function NotesView() {
  const notes = useSWR<List<Note>>("/notes");
  const reminders = useSWR<List<Reminder>>("/reminders");
  const { profile } = useProfile();
  const { toast, confirm } = useFeedback();
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState("");
  const [editing, setEditing] = useState<Note | "new" | null>(null);
  useNewAction(() => setEditing("new"));

  if (notes.error && !notes.data) return <LoadError error={notes.error} retry={() => notes.mutate()} />;
  if (!notes.data) return <PageSkeleton />;

  const today = notes.data.today ?? "";
  const all = notes.data.items;
  const tags = [...new Set(all.map((n) => n.tag).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const q = query.trim().toLowerCase();
  const shown = all.filter((n) => (!tag || n.tag === tag) && (!q || `${n.title} ${n.body} ${n.tag}`.toLowerCase().includes(q)));
  const pinned = shown.filter((n) => n.pinned);
  const others = shown.filter((n) => !n.pinned);

  const togglePin = async (note: Note) => {
    await notes.mutate((current) => current && { ...current, items: current.items.map((n) => (n.id === note.id ? { ...n, pinned: !n.pinned } : n)) }, { revalidate: false });
    try {
      await api(`/notes/${note.id}`, { method: "PATCH", body: { pinned: !note.pinned } });
    } catch (e) {
      toast(errorMessage(e), "error");
    }
    await refresh("/notes");
  };

  const remove = async (note: Note) => {
    if (!(await confirm({ title: "Delete this note?", message: toArchive(`“${note.title}”`) }))) return;
    // Gone at once; it comes back if the delete fails.
    setEditing(null);
    await notes.mutate((current) => current && { ...current, items: current.items.filter((n) => n.id !== note.id) }, { revalidate: false });
    try {
      await api(`/notes/${note.id}`, { method: "DELETE" });
      toast("Note moved to the Archive");
    } catch (e) {
      toast(errorMessage(e), "error");
    }
    await refresh("/notes");
  };

  const card = (note: Note) => {
    const palette = colorOf(note.color);
    return (
      <article
        key={note.id}
        className={`group mb-5 cursor-pointer break-inside-avoid rounded-2xl border p-5 transition hover:shadow-md ${palette.note}`}
        onClick={() => setEditing(note)}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="min-w-0 font-semibold text-slate-900">
            <button type="button" className="max-w-full text-left focus-visible:underline focus-visible:outline-none" onClick={() => setEditing(note)}>
              {note.title}
            </button>
          </h3>
          <div className="flex shrink-0 gap-0.5 opacity-60 transition group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={`btn btn-ghost btn-sm btn-icon ${note.pinned ? "text-blue-600" : ""}`}
              aria-pressed={note.pinned}
              aria-label={note.pinned ? "Unpin note" : "Pin note"}
              onClick={() => togglePin(note)}
            >
              <Pin className={`size-4 ${note.pinned ? "fill-current" : ""}`} />
            </button>
            <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label="Delete note" onClick={() => remove(note)}>
              <Trash2 className="size-4" />
            </button>
          </div>
        </div>
        {note.body && <NoteBody text={note.body} />}
        <div className="mt-4 flex items-center justify-between gap-2 text-xs text-slate-500">
          {note.tag ? <span className={`badge ${note.color === "white" ? "bg-slate-100" : "bg-white/70"} text-slate-600`}>{note.tag}</span> : <span />}
          <span title={`Edited ${new Date(note.updated_at).toLocaleString()}`}>{relativeDay(dayOf(note.updated_at, profile?.timezone), today)}</span>
        </div>
      </article>
    );
  };

  return (
    <>
      <PageHeader title="Notes" description="Catch ideas before they fly away.">
        <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
          <Plus className="size-4" />
          New Note
        </button>
      </PageHeader>

      <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-48 flex-1 sm:max-w-sm">
              <span className="sr-only">Search notes</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input type="search" placeholder="Search notes" className="input pl-9" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            <select className="select select-lg w-auto max-w-full" value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Tag">
              <option value="">All tags</option>
              {tags.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <p className="ml-auto text-sm text-slate-500">{shown.length === all.length ? plural(all.length, "note") : `${shown.length} of ${plural(all.length, "note")}`}</p>
          </div>

          {all.length === 0 ? (
            <div className="card mt-6">
              <EmptyState icon={NotebookPen} title="No notes yet" text="Write down ideas, lists and things to remember. Pin the important ones to keep them on top.">
                <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
                  <Plus className="size-4" /> New note
                </button>
              </EmptyState>
            </div>
          ) : shown.length === 0 ? (
            <p className="mt-10 text-center text-sm text-slate-500">No notes match.</p>
          ) : (
            <>
              {pinned.length > 0 && (
                <section className="mt-6" aria-labelledby="pinned-title">
                  <h2 id="pinned-title" className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <Pin className="size-3.5" />
                    Pinned
                  </h2>
                  <div className="mt-3 columns-1 gap-5 md:columns-2 2xl:columns-3">{pinned.map(card)}</div>
                </section>
              )}
              {others.length > 0 && (
                <section className={pinned.length ? "mt-2" : "mt-6"} aria-labelledby="others-title">
                  {pinned.length > 0 && (
                    <h2 id="others-title" className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Other notes
                    </h2>
                  )}
                  <div className="mt-3 columns-1 gap-5 md:columns-2 2xl:columns-3">{others.map(card)}</div>
                </section>
              )}
            </>
          )}
        </div>

        <aside>
          <RemindersPanel data={reminders.data} error={reminders.error} retry={() => reminders.mutate()} />
        </aside>
      </div>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "New note" : "Edit note"} size="lg">
        {editing !== null && <NoteForm note={editing === "new" ? undefined : editing} tags={tags} defaultTag={tag} onDelete={remove} onClose={() => setEditing(null)} />}
      </Modal>
    </>
  );
}

function NoteForm({ note, tags, defaultTag, onDelete, onClose }: { note?: Note; tags: string[]; defaultTag: string; onDelete: (note: Note) => void; onClose: () => void }) {
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const body = {
      title: String(form.get("title")),
      body: String(form.get("body")),
      tag: String(form.get("tag")),
      color: String(form.get("color")),
      pinned: form.get("pinned") === "on",
    };
    setBusy(true);
    try {
      await api(note ? `/notes/${note.id}` : "/notes", { method: note ? "PATCH" : "POST", body });
      await refresh("/notes");
      toast(note ? "Note saved" : "Note added");
      onClose();
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Title" htmlFor="note-title">
        <input id="note-title" name="title" className="input" required maxLength={200} defaultValue={note?.title} autoComplete="off" autoFocus />
      </Field>
      <Field label="Note" htmlFor="note-body" hint="Start lines with “- ” for a bulleted list or “1. ” for a numbered list.">
        <textarea id="note-body" name="body" rows={8} maxLength={10000} className="input h-auto min-h-40 py-2.5 leading-relaxed" defaultValue={note?.body} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
        <Field label="Tag" htmlFor="note-tag">
          <input id="note-tag" name="tag" className="input" maxLength={30} list="note-tags" defaultValue={note?.tag ?? defaultTag} placeholder="e.g. Work" autoComplete="off" />
          <datalist id="note-tags">
            {tags.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>
        <Field label="Colour">
          <ColorPicker name="color" value={note?.color ?? "white"} colors={[...NOTE_COLORS]} />
        </Field>
      </div>
      <label className="flex items-center gap-3 text-sm text-slate-700">
        <input type="checkbox" name="pinned" className="checkbox" defaultChecked={note?.pinned ?? false} />
        Pin to the top
      </label>
      <ModalActions
        onCancel={onClose}
        submitLabel={note ? "Save note" : "Add note"}
        busy={busy}
        left={
          note && (
            <button type="button" className="btn btn-ghost text-rose-600" onClick={() => onDelete(note)}>
              <Trash2 className="size-4" /> Delete
            </button>
          )
        }
      />
    </form>
  );
}

function RemindersPanel({ data, error, retry }: { data: List<Reminder> | undefined; error: unknown; retry: () => void }) {
  const { toast } = useFeedback();
  const [editing, setEditing] = useState<Reminder | null>(null);
  const [text, setText] = useState("");
  const [due, setDue] = useState("");
  const [adding, setAdding] = useState(false);

  const act = async (work: () => Promise<unknown>, message?: string) => {
    try {
      await work();
      if (message) toast(message);
    } catch (e) {
      toast(errorMessage(e), "error");
    }
    await refresh("/reminders");
  };

  const add = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const value = text.trim();
    if (!value || adding) return;
    setAdding(true);
    await act(() => api("/reminders", { method: "POST", body: { text: value, due_date: due || null } }));
    setText("");
    setDue("");
    setAdding(false);
  };

  const today = data?.today ?? "";
  const items = data?.items ?? [];
  const open = items.filter((r) => !r.done).length;

  return (
    <section className="card p-5 xl:sticky xl:top-24" aria-labelledby="rem-title">
      <div className="flex items-center justify-between">
        <h2 id="rem-title" className="card-title flex items-center gap-2.5">
          <span className="icon-tile size-8 bg-amber-50 text-amber-600">
            <BellRing className="size-4" />
          </span>
          Reminders
        </h2>
        {data && <span className="badge bg-slate-100 text-slate-600">{open} open</span>}
      </div>

      {error && !data ? (
        <p className="mt-4 text-sm text-slate-500">
          Reminders could not load.{" "}
          <button type="button" className="font-medium text-blue-600" onClick={retry}>Try again</button>
        </p>
      ) : !data ? (
        <div className="mt-4 space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton h-5" />
          ))}
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map((r) => {
            const late = !r.done && r.due_date !== null && daysBetween(today, r.due_date) < 0;
            return (
              <li key={r.id} className="group flex items-start gap-2.5">
                <input
                  id={`rem-${r.id}`}
                  type="checkbox"
                  className="checkbox peer mt-0.5"
                  checked={r.done}
                  onChange={() => act(() => api(`/reminders/${r.id}`, { method: "PATCH", body: { done: !r.done } }), r.done ? undefined : "Reminder done")}
                />
                <label htmlFor={`rem-${r.id}`} className="min-w-0 flex-1 text-sm text-slate-700 peer-checked:text-slate-400 peer-checked:line-through">
                  {r.text}
                </label>
                {r.due_date && (
                  <span className={`whitespace-nowrap text-xs ${late ? "font-medium text-rose-500" : "text-slate-400"}`} title={formatDate(r.due_date, "full")}>
                    {relativeDay(r.due_date, today)}
                  </span>
                )}
                <button type="button" className="reveal -my-2 -mr-1 shrink-0 rounded-md p-2 text-slate-400 hover:text-slate-600" onClick={() => setEditing(r)} aria-label="Edit reminder">
                  <NotebookPen className="size-4" />
                </button>
              </li>
            );
          })}
          {!items.length && <li className="text-sm text-slate-500">No reminders. Add one below.</li>}
        </ul>
      )}

      <form onSubmit={add} className="mt-4 space-y-2">
        <label className="flex items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-2.5 transition focus-within:border-blue-300 focus-within:bg-blue-50/40">
          <Plus className="size-4 shrink-0 text-slate-400" />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={200}
            autoComplete="off"
            placeholder="Add a reminder…"
            aria-label="New reminder"
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
          />
        </label>
        {text.trim() && (
          <div className="flex items-center gap-2">
            <input type="date" className="input h-9 flex-1" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date (optional)" />
            <button type="submit" className="btn btn-primary btn-sm" disabled={adding}>
              Add
            </button>
          </div>
        )}
      </form>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title="Edit reminder" size="sm">
        {editing && <ReminderForm reminder={editing} onClose={() => setEditing(null)} />}
      </Modal>
    </section>
  );
}

function ReminderForm({ reminder, onClose }: { reminder: Reminder; onClose: () => void }) {
  const { toast, confirm } = useFeedback();
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await api(`/reminders/${reminder.id}`, { method: "PATCH", body: { text: String(form.get("text")), due_date: String(form.get("due_date")) || null } });
      await refresh("/reminders");
      toast("Reminder saved");
      onClose();
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!(await confirm({ title: "Delete this reminder?", message: toArchive(`“${reminder.text}”`) }))) return;
    try {
      await api(`/reminders/${reminder.id}`, { method: "DELETE" });
      await refresh("/reminders");
      toast("Reminder moved to the Archive");
      onClose();
    } catch (error) {
      toast(errorMessage(error), "error");
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Reminder" htmlFor="rem-text">
        <input id="rem-text" name="text" className="input" required maxLength={200} defaultValue={reminder.text} autoComplete="off" autoFocus />
      </Field>
      <Field label="Due date (optional)" htmlFor="rem-due">
        <input id="rem-due" name="due_date" type="date" className="input" defaultValue={reminder.due_date ?? ""} />
      </Field>
      <ModalActions
        onCancel={onClose}
        submitLabel="Save"
        busy={busy}
        left={
          <button type="button" className="btn btn-ghost text-rose-600" onClick={remove}>
            <Trash2 className="size-4" /> Delete
          </button>
        }
      />
    </form>
  );
}
