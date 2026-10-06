"use client";

import { useState, type FormEvent } from "react";
import useSWR from "swr";
import Link from "next/link";
import { BriefcaseBusiness, ChevronLeft, FolderKanban, ChevronRight, Plus, Repeat, Trash2 } from "lucide-react";
import { api, errorMessage, refresh } from "@/lib/api";
import { colorOf } from "@/lib/colors";
import { addDays, addMonths, daysBetween, formatDate, monthGrid, relativeDay, weekdayNames } from "@/lib/dates";
import { hm, minutesOf, shortTime } from "@/lib/format";
import { useCategories, useNowMinutes } from "@/lib/hooks";
import { useNewAction } from "@/lib/new-action";
import { useProfile } from "@/lib/profile";
import type { CalendarEvent, List, Repeat as RepeatKind } from "@/lib/types";
import { Field } from "@/components/ui/controls";
import { useFeedback } from "@/components/ui/feedback";
import { Modal, ModalActions } from "@/components/ui/modal";
import { LoadError, PageHeader, PageSkeleton } from "@/components/ui/states";

/** A job whose last day to apply is this date (saved jobs only). */
type JobDeadline = { id: string; title: string; company: string; date: string };
/** A project's due date (active projects with a due date only). */
type ProjectDate = { id: string; project_id: string; title: string; kind: "deadline"; date: string; color: string };
type EventsResponse = List<CalendarEvent> & { today: string; from: string; to: string; deadlines?: JobDeadline[]; project_dates?: ProjectDate[] };
const byTime = (a: CalendarEvent, b: CalendarEvent) => (a.all_day === b.all_day ? (a.start_time ?? "").localeCompare(b.start_time ?? "") : a.all_day ? -1 : 1);

export function CalendarView() {
  const { profile, time } = useProfile();
  const { categories, byId } = useCategories();
  const now = useNowMinutes();
  const today = profile?.today;
  // Start on ?date=… (from search results) or on today.
  const [requested] = useState(() => {
    const date = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("date");
    return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
  });
  const [chosenMonth, setMonth] = useState<string | null>(null);
  const [chosenDay, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<CalendarEvent | "new" | null>(null);
  useNewAction(() => setEditing("new"));

  const start = requested ?? today;
  const month = chosenMonth ?? start?.slice(0, 7) ?? null;
  const selected = chosenDay ?? start ?? null;

  const grid = month ? monthGrid(month, profile?.week_start ?? 1) : [];
  const { data, error, mutate } = useSWR<EventsResponse>(month ? `/events?from=${grid[0]}&to=${grid[41]}` : null);
  const { data: upcoming } = useSWR<EventsResponse>(today ? `/events?from=${today}&to=${addDays(today, 45)}` : null);

  if (error && !data) return <LoadError error={error} retry={() => mutate()} />;
  if (!month || !selected || !today || !data) return <PageSkeleton />;

  const eventsOn = (day: string) => data.items.filter((e) => e.date === day).sort(byTime);
  const deadlinesOn = (day: string) => (data.deadlines ?? []).filter((j) => j.date === day);
  const projectDatesOn = (day: string) => (data.project_dates ?? []).filter((p) => p.date === day);
  const agenda = eventsOn(selected);
  const agendaDeadlines = deadlinesOn(selected);
  const agendaProjects = projectDatesOn(selected);
  const diff = daysBetween(today, selected);
  const comingUp = (upcoming?.items ?? [])
    .filter((e) => e.date > today || (!e.all_day && e.start_time && minutesOf(e.start_time) > now))
    .slice(0, 6);
  const color = (e: CalendarEvent) => colorOf(e.category_id ? byId.get(e.category_id)?.color : "slate");

  const pick = (day: string) => {
    setSelected(day);
    setMonth(day.slice(0, 7));
  };

  return (
    <>
      <PageHeader title="Calendar" description="Your days, at a glance.">
        <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
          <Plus className="size-4" />
          New Event
        </button>
      </PageHeader>

      <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="card overflow-hidden" aria-label="Month view">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4 sm:px-5">
            <div className="flex items-center gap-2">
              <h2 className="min-w-44 text-xl font-bold text-slate-900">{formatDate(month, "month")}</h2>
              <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month">
                <ChevronLeft className="size-4" />
              </button>
              <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month">
                <ChevronRight className="size-4" />
              </button>
              <button type="button" className="btn btn-secondary btn-sm ml-1" onClick={() => pick(today)}>
                Today
              </button>
            </div>
            <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
              {categories.map((c) => (
                <li key={c.id} className="flex items-center gap-1.5">
                  <span className={`size-2.5 rounded-full ${colorOf(c.color).dot}`} />
                  {c.name}
                </li>
              ))}
            </ul>
          </div>
          <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/70 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
            {weekdayNames(profile?.week_start ?? 1).map((d) => (
              <div key={d} className="py-2.5">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {grid.map((day, i) => {
              const list = eventsOn(day);
              const due = deadlinesOn(day);
              const projectDue = projectDatesOn(day);
              const inMonth = day.slice(0, 7) === month;
              const isSelected = day === selected;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => pick(day)}
                  aria-pressed={isSelected}
                  aria-label={`${formatDate(day, "long")}${list.length ? `, ${list.length} events` : ""}${due.length ? `, ${due.length} job deadlines` : ""}${projectDue.length ? `, ${projectDue.length} project due` : ""}`}
                  className={`flex min-h-20 min-w-0 flex-col gap-1 border-slate-100 p-1.5 text-left transition hover:bg-slate-50 sm:min-h-28 sm:p-2 ${i % 7 === 6 ? "" : "border-r"} ${i < 35 ? "border-b" : ""} ${isSelected ? "bg-blue-50/70 ring-2 ring-inset ring-blue-200" : inMonth ? "" : "bg-slate-50/60"}`}
                >
                  <span className={`grid size-7 shrink-0 place-items-center rounded-full text-sm font-medium ${day === today ? "bg-blue-600 text-white" : inMonth ? "text-slate-700" : "text-slate-300"}`}>{Number(day.slice(8))}</span>
                  {due.slice(0, 2).map((j) => (
                    <span key={`${j.id}-due`} className="hidden truncate rounded-md bg-rose-50 px-1.5 py-0.5 text-[11px] font-medium text-rose-700 sm:block" title={`Last day to apply: ${j.title}`}>
                      Apply: {j.title}
                    </span>
                  ))}
                  {projectDue.slice(0, 2).map((p) => (
                    <span key={p.id} className={`hidden truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium sm:block ${colorOf(p.color).badge}`} title={`Project due: ${p.title}`}>
                      Due: {p.title}
                    </span>
                  ))}
                  {list.slice(0, 3).map((e) => (
                    <span key={`${e.id}-${day}`} className={`hidden truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium sm:block ${color(e).badge}`}>
                      {!e.all_day && e.start_time && <span className="opacity-70">{shortTime(e.start_time, profile?.time_format)} </span>}
                      {e.title}
                    </span>
                  ))}
                  {list.length > 3 && <span className="hidden px-1.5 text-[11px] font-medium text-slate-500 sm:block">+{list.length - 3} more</span>}
                  {(list.length > 0 || due.length > 0 || projectDue.length > 0) && (
                    <span className="flex flex-wrap gap-0.5 sm:hidden">
                      {due.slice(0, 2).map((j) => (
                        <span key={`${j.id}-dot-due`} className="size-1.5 rounded-full bg-rose-500" />
                      ))}
                      {projectDue.slice(0, 2).map((p) => (
                        <span key={`${p.id}-dot`} className={`size-1.5 rounded-full ${colorOf(p.color).dot}`} />
                      ))}
                      {list.slice(0, 4).map((e) => (
                        <span key={`${e.id}-dot`} className={`size-1.5 rounded-full ${color(e).dot}`} />
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <aside className="space-y-5">
          <section className="card p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                  {diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : diff === -1 ? "Yesterday" : diff > 0 ? `In ${diff} days` : `${-diff} days ago`}
                </p>
                <h2 className="text-lg font-bold text-slate-900">{formatDate(selected, "long")}</h2>
              </div>
              <button type="button" className="btn btn-secondary btn-sm btn-icon" onClick={() => setEditing("new")} aria-label="Add an event on this day">
                <Plus className="size-4" />
              </button>
            </div>
            {agendaProjects.length > 0 && (
              <ul className="mt-4 space-y-1.5">
                {agendaProjects.map((p) => (
                  <li key={`${p.id}-agenda-due`}>
                    <Link href={`/projects/${p.project_id}`} className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition hover:brightness-95 ${colorOf(p.color).badge}`}>
                      <FolderKanban className="size-4 shrink-0" />
                      <span className="min-w-0 truncate"><b className="font-semibold">Project due:</b> {p.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {agendaDeadlines.length > 0 && (
              <ul className="mt-4 space-y-1.5">
                {agendaDeadlines.map((j) => (
                  <li key={`${j.id}-agenda-due`}>
                    <Link href="/jobs" className="flex items-center gap-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800 transition hover:bg-rose-100">
                      <BriefcaseBusiness className="size-4 shrink-0" />
                      <span className="min-w-0 truncate">
                        <b className="font-semibold">Last day to apply:</b> {j.title}
                        {j.company && <span className="text-rose-600"> · {j.company}</span>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {agenda.length ? (
              <ol className="mt-4 space-y-1">
                {agenda.map((e) => (
                  <li key={`${e.id}-agenda`}>
                    <button type="button" onClick={() => setEditing(e)} className="grid w-full grid-cols-[4.25rem_auto_1fr] items-start gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-slate-50">
                      <span className="pt-0.5 text-xs font-medium text-slate-500">{e.all_day ? "All day" : time(e.start_time!)}</span>
                      <span className={`mt-0.5 h-9 w-1 rounded-full ${color(e).dot}`} />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 truncate text-sm font-semibold text-slate-800">
                          {e.title}
                          {e.repeat !== "none" && <Repeat className="size-3.5 shrink-0 text-slate-400" aria-label="Repeats" />}
                        </span>
                        <span className="block truncate text-xs text-slate-500">
                          {e.all_day ? (e.category_id ? byId.get(e.category_id)?.name : "All day") : hm((minutesOf(e.end_time!) - minutesOf(e.start_time!)) / 60)}
                          {e.note && ` · ${e.note}`}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            ) : agendaDeadlines.length || agendaProjects.length ? null : (
              <p className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">Nothing planned. Enjoy the free time!</p>
            )}
          </section>

          <section className="card p-5">
            <h2 className="card-title">Coming up</h2>
            {comingUp.length ? (
              <ol className="mt-3 divide-y divide-slate-100">
                {comingUp.map((e) => (
                  <li key={`${e.id}-${e.date}-up`}>
                    <button type="button" className="flex w-full items-center gap-3 py-2.5 text-left" onClick={() => pick(e.date)}>
                      <span className="w-11 shrink-0 rounded-lg bg-slate-50 py-1 text-center ring-1 ring-slate-100">
                        <span className="block text-[10px] font-semibold uppercase text-slate-500">{formatDate(e.date, "weekday")}</span>
                        <span className="block text-base font-bold leading-tight text-slate-900">{Number(e.date.slice(8))}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-800">{e.title}</span>
                        <span className="block text-xs text-slate-500">{relativeDay(e.date, today)} · {e.all_day ? "All day" : time(e.start_time!)}</span>
                      </span>
                      <span className={`size-2 shrink-0 rounded-full ${color(e).dot}`} />
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 text-sm text-slate-500">Nothing in the next few weeks.</p>
            )}
          </section>
        </aside>
      </div>

      <EventModal event={editing} defaultDate={selected} onClose={() => setEditing(null)} />
    </>
  );
}

function EventModal({ event, defaultDate, onClose }: { event: CalendarEvent | "new" | null; defaultDate: string; onClose: () => void }) {
  const editing = event && event !== "new" ? event : null;
  return (
    <Modal open={event !== null} onClose={onClose} title={editing ? "Edit event" : "New event"} description={editing && editing.repeat !== "none" ? "Changes apply to every repeat." : "Block time for what matters."}>
      <EventForm editing={editing} defaultDate={defaultDate} onClose={onClose} />
    </Modal>
  );
}

// Mounted fresh each time the window opens, so its state starts from the event.
function EventForm({ editing, defaultDate, onClose }: { editing: CalendarEvent | null; defaultDate: string; onClose: () => void }) {
  const { categories } = useCategories();
  const { toast, confirm } = useFeedback();
  const [busy, setBusy] = useState(false);
  const [allDay, setAllDay] = useState(editing?.all_day ?? false);
  const [repeat, setRepeat] = useState<RepeatKind>(editing?.repeat ?? "none");

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const body = {
      title: String(form.get("title")),
      event_date: String(form.get("event_date")),
      all_day: allDay,
      start_time: allDay ? null : String(form.get("start_time")),
      end_time: allDay ? null : String(form.get("end_time")),
      repeat,
      repeat_until: repeat === "none" ? null : String(form.get("repeat_until")) || null,
      category_id: String(form.get("category_id")) || null,
      note: String(form.get("note")),
    };
    setBusy(true);
    try {
      await api(editing ? `/events/${editing.id}` : "/events", { method: editing ? "PATCH" : "POST", body });
      await refresh("/events");
      toast(editing ? "Event saved" : "Event added");
      onClose();
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!editing) return;
    const message = editing.repeat === "none" ? `“${editing.title}” will be removed.` : `“${editing.title}” repeats. Every day of it will be removed.`;
    if (!(await confirm({ title: "Delete this event?", message }))) return;
    try {
      await api(`/events/${editing.id}`, { method: "DELETE" });
      await refresh("/events");
      toast("Event deleted");
      onClose();
    } catch (error) {
      toast(errorMessage(error), "error");
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
        <Field label="Title" htmlFor="event-title">
          <input id="event-title" name="title" className="input" required maxLength={200} defaultValue={editing?.title} placeholder="e.g. Coffee with Rahim" autoComplete="off" autoFocus />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={repeat === "none" ? "Date" : "Starts on"} htmlFor="event-date">
            <input id="event-date" name="event_date" type="date" className="input" required defaultValue={editing?.event_date ?? defaultDate} />
          </Field>
          <Field label="Starts" htmlFor="event-start">
            <input id="event-start" name="start_time" type="time" className="input" disabled={allDay} required={!allDay} defaultValue={editing?.start_time?.slice(0, 5) ?? "10:00"} />
          </Field>
          <Field label="Ends" htmlFor="event-end">
            <input id="event-end" name="end_time" type="time" className="input" disabled={allDay} required={!allDay} defaultValue={editing?.end_time?.slice(0, 5) ?? "11:00"} />
          </Field>
        </div>
        <label className="flex items-center gap-3 text-sm text-slate-700">
          <input type="checkbox" className="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
          All-day event
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Repeats" htmlFor="event-repeat">
            <select id="event-repeat" className="select select-lg" value={repeat} onChange={(e) => setRepeat(e.target.value as RepeatKind)}>
              <option value="none">Does not repeat</option>
              <option value="daily">Every day</option>
              <option value="weekly">Every week</option>
            </select>
          </Field>
          <Field label="Until (optional)" htmlFor="event-until">
            <input id="event-until" name="repeat_until" type="date" className="input" disabled={repeat === "none"} defaultValue={editing?.repeat_until ?? ""} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" htmlFor="event-category">
            <select id="event-category" name="category_id" className="select select-lg" defaultValue={editing?.category_id ?? categories.find((c) => c.name === "Personal")?.id ?? ""}>
              <option value="">No category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Place or note" htmlFor="event-note">
            <input id="event-note" name="note" className="input" maxLength={300} defaultValue={editing?.note} placeholder="Optional" autoComplete="off" />
          </Field>
        </div>
        <ModalActions
          onCancel={onClose}
          submitLabel={editing ? "Save event" : "Add event"}
          busy={busy}
          left={editing && (
            <button type="button" className="btn btn-danger" onClick={remove}>
              <Trash2 className="size-4" /> Delete
            </button>
          )}
        />
      </form>
  );
}
