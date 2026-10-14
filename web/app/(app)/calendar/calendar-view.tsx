"use client";

import { toArchive } from "@/lib/archive";
import { useState, type FormEvent } from "react";
import useSWR from "swr";
import Link from "next/link";
import { BriefcaseBusiness, CalendarDays, ChevronLeft, CircleAlert, FolderKanban, ChevronRight, GraduationCap, Plus, Repeat, Trash2 } from "lucide-react";
import { api, errorMessage, refresh } from "@/lib/api";
import { colorOf } from "@/lib/colors";
import { addDays, addMonths, daysBetween, formatDate, monthGrid, relativeDay, weekdayNames } from "@/lib/dates";
import { hm, minutesOf, shortTime } from "@/lib/format";
import { useCategories, useNowMinutes } from "@/lib/hooks";
import { useNewAction } from "@/lib/new-action";
import { useProfile } from "@/lib/profile";
import type { GoogleEvent, GoogleStatus } from "@/lib/google-calendar";
import type { CalendarEvent, List, Repeat as RepeatKind } from "@/lib/types";
import { Field, Switch } from "@/components/ui/controls";
import { useFeedback } from "@/components/ui/feedback";
import { Modal, ModalActions } from "@/components/ui/modal";
import { LoadError, PageHeader, PageSkeleton } from "@/components/ui/states";

/** A job whose last day to apply is this date (saved jobs only). */
type JobDeadline = { id: string; title: string; company: string; date: string };
/** A project's due date (active projects with a due date only). */
type ProjectDate = { id: string; project_id: string; title: string; kind: "deadline"; date: string; color: string };
/** A study session planned for a day (not done yet). */
type StudyDate = { id: string; date: string; hours: number; activity: string };
type EventsResponse = List<CalendarEvent> & { today: string; from: string; to: string; deadlines?: JobDeadline[]; project_dates?: ProjectDate[]; study?: StudyDate[]; google?: GoogleEvent[]; google_status?: GoogleStatus };

const HIDE_GOOGLE_KEY = "calendar-hide-google";
/** Whether the person hid the Google events on this device (a convenience kept in the browser). */
function googleHidden() {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(HIDE_GOOGLE_KEY) === "1";
  } catch {
    return false;
  }
}
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
  const [hideGoogle, setHideGoogle] = useState(googleHidden);
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
  const studyOn = (day: string) => (data.study ?? []).filter((b) => b.date === day);
  const googleOn = (day: string) => (hideGoogle ? [] : (data.google ?? []).filter((g) => g.date === day));
  const googleConnected = data.google_status !== undefined && data.google_status !== "off";
  const agenda = eventsOn(selected);
  const agendaDeadlines = deadlinesOn(selected);
  const agendaProjects = projectDatesOn(selected);
  const agendaStudy = studyOn(selected);
  const agendaGoogle = googleOn(selected);
  const diff = daysBetween(today, selected);
  const color = (e: CalendarEvent) => colorOf(e.category_id ? byId.get(e.category_id)?.color : "slate");
  type Soon = { key: string; date: string; title: string; all_day: boolean; start_time: string | null; dot: string; dotColor?: string };
  const comingUp: Soon[] = [
    ...(upcoming?.items ?? []).map((e): Soon => ({ key: `${e.id}-${e.date}-up`, date: e.date, title: e.title, all_day: e.all_day, start_time: e.start_time, dot: color(e).dot })),
    ...(hideGoogle ? [] : (upcoming?.google ?? [])).map((g): Soon => ({ key: `${g.id}-up`, date: g.date, title: g.title, all_day: g.all_day, start_time: g.start_time, dot: "", dotColor: g.color })),
  ]
    .filter((e) => e.date > today || (!e.all_day && e.start_time && minutesOf(e.start_time) > now))
    .sort((a, b) => a.date.localeCompare(b.date) || Number(b.all_day) - Number(a.all_day) || (a.start_time ?? "").localeCompare(b.start_time ?? ""))
    .slice(0, 6);

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

      {data.google_status === "reconnect" && (
        <p className="mt-5 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>Google Calendar needs to be connected again. <Link href="/settings?tab=integrations" className="font-semibold underline">Open Settings</Link></span>
        </p>
      )}
      {data.google_status === "error" && (
        <p className="mt-5 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="status">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>Google Calendar could not be reached just now, so only your own events are shown. It will come back by itself.</span>
        </p>
      )}

      <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="card overflow-hidden" aria-label="Month view">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4 sm:px-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="w-full text-xl font-bold text-slate-900 sm:w-auto sm:min-w-44">{formatDate(month, "month")}</h2>
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
              {googleConnected && (
                <li className="flex items-center gap-2">
                  <CalendarDays className="size-3.5 text-blue-600" aria-hidden />
                  Google
                  <Switch
                    checked={!hideGoogle}
                    label="Show Google Calendar events"
                    onChange={(show) => {
                      setHideGoogle(!show);
                      try {
                        if (show) window.localStorage.removeItem(HIDE_GOOGLE_KEY);
                        else window.localStorage.setItem(HIDE_GOOGLE_KEY, "1");
                      } catch {
                        // Only a convenience: it still works for this visit.
                      }
                    }}
                  />
                </li>
              )}
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
              const studying = studyOn(day);
              const gList = googleOn(day);
              const inMonth = day.slice(0, 7) === month;
              const isSelected = day === selected;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => pick(day)}
                  aria-pressed={isSelected}
                  aria-label={`${formatDate(day, "long")}${list.length ? `, ${list.length} events` : ""}${due.length ? `, ${due.length} job deadlines` : ""}${projectDue.length ? `, ${projectDue.length} project due` : ""}${studying.length ? `, ${studying.length} study sessions` : ""}${gList.length ? `, ${gList.length} Google events` : ""}`}
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
                  {studying.slice(0, 1).map((b) => (
                    <span key={`${b.id}-study`} className="hidden truncate rounded-md bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700 sm:block" title={`Study ${hm(b.hours)}: ${b.activity}`}>
                      Study {hm(b.hours)}{studying.length > 1 ? ` +${studying.length - 1}` : ""}
                    </span>
                  ))}
                  {list.slice(0, 3).map((e) => (
                    <span key={`${e.id}-${day}`} className={`hidden truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium sm:block ${color(e).badge}`}>
                      {!e.all_day && e.start_time && <span className="opacity-70">{shortTime(e.start_time, profile?.time_format)} </span>}
                      {e.title}
                    </span>
                  ))}
                  {list.length > 3 && <span className="hidden px-1.5 text-[11px] font-medium text-slate-500 sm:block">+{list.length - 3} more</span>}
                  {gList.slice(0, 2).map((g) => (
                    <span key={g.id} className="hidden truncate rounded-md border-l-[3px] bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-700 sm:block" style={{ borderLeftColor: g.color }} title={`${g.title} (${g.calendar})`}>
                      {!g.all_day && g.start_time && <span className="opacity-70">{shortTime(g.start_time, profile?.time_format)} </span>}
                      {g.title}
                    </span>
                  ))}
                  {gList.length > 2 && <span className="hidden px-1.5 text-[11px] font-medium text-slate-500 sm:block">+{gList.length - 2} Google</span>}
                  {(list.length > 0 || due.length > 0 || projectDue.length > 0 || studying.length > 0 || gList.length > 0) && (
                    <span className="flex flex-wrap gap-0.5 sm:hidden">
                      {studying.slice(0, 1).map((b) => (
                        <span key={`${b.id}-dot-study`} className="size-1.5 rounded-full bg-indigo-500" />
                      ))}
                      {due.slice(0, 2).map((j) => (
                        <span key={`${j.id}-dot-due`} className="size-1.5 rounded-full bg-rose-500" />
                      ))}
                      {projectDue.slice(0, 2).map((p) => (
                        <span key={`${p.id}-dot`} className={`size-1.5 rounded-full ${colorOf(p.color).dot}`} />
                      ))}
                      {list.slice(0, 4).map((e) => (
                        <span key={`${e.id}-dot`} className={`size-1.5 rounded-full ${color(e).dot}`} />
                      ))}
                      {gList.slice(0, 3).map((g) => (
                        <span key={`${g.id}-dot`} className="size-1.5 rounded-full" style={{ backgroundColor: g.color }} />
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
            {agendaStudy.length > 0 && (
              <ul className="mt-4 space-y-1.5">
                {agendaStudy.map((b) => (
                  <li key={`${b.id}-agenda-study`}>
                    <Link href="/learning" className="flex items-center gap-3 rounded-xl bg-indigo-50 px-3 py-2 text-sm text-indigo-800 transition hover:bg-indigo-100">
                      <GraduationCap className="size-4 shrink-0" />
                      <span className="min-w-0 truncate"><b className="font-semibold">Study {hm(b.hours)}:</b> {b.activity}</span>
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
                        <span className="flex items-start gap-1.5 text-sm font-semibold text-slate-800">
                          <span className="min-w-0 line-clamp-2">{e.title}</span>
                          {e.repeat !== "none" && <Repeat className="mt-0.5 size-3.5 shrink-0 text-slate-400" aria-label="Repeats" />}
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
            ) : agendaDeadlines.length || agendaProjects.length || agendaStudy.length || agendaGoogle.length ? null : (
              <p className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">Nothing planned. Enjoy the free time!</p>
            )}
            {agendaGoogle.length > 0 && (
              <div className={agenda.length ? "mt-3 border-t border-slate-100 pt-3" : "mt-4"}>
                <h3 className="flex items-center gap-1.5 px-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <CalendarDays className="size-3.5" aria-hidden />
                  Google Calendar
                </h3>
                <ol className="mt-1 space-y-1">
                  {agendaGoogle.map((g) => {
                    const inner = (
                      <>
                        <span className="pt-0.5 text-xs font-medium text-slate-500">{g.all_day || !g.start_time ? "All day" : time(g.start_time)}</span>
                        <span className="mt-0.5 h-9 w-1 rounded-full" style={{ backgroundColor: g.color }} />
                        <span className="min-w-0">
                          <span className="block min-w-0 line-clamp-2 text-sm font-semibold text-slate-800">{g.title}</span>
                          <span className="block truncate text-xs text-slate-500">
                            {g.calendar}
                            {g.location && ` · ${g.location}`}
                          </span>
                        </span>
                      </>
                    );
                    const row = "grid w-full grid-cols-[4.25rem_auto_1fr] items-start gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-slate-50";
                    return (
                      <li key={`${g.id}-agenda`}>
                        {g.link ? (
                          <a href={g.link} target="_blank" rel="noopener noreferrer" className={row} aria-label={`${g.title}, open in Google Calendar`}>
                            {inner}
                          </a>
                        ) : (
                          <div className={row}>{inner}</div>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
          </section>

          <section className="card p-5">
            <h2 className="card-title">Coming up</h2>
            {comingUp.length ? (
              <ol className="mt-3 divide-y divide-slate-100">
                {comingUp.map((e) => (
                  <li key={e.key}>
                    <button type="button" className="flex w-full items-center gap-3 py-2.5 text-left" onClick={() => pick(e.date)}>
                      <span className="w-11 shrink-0 rounded-lg bg-slate-50 py-1 text-center ring-1 ring-slate-100">
                        <span className="block text-[10px] font-semibold uppercase text-slate-500">{formatDate(e.date, "weekday")}</span>
                        <span className="block text-base font-bold leading-tight text-slate-900">{Number(e.date.slice(8))}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-800">{e.title}</span>
                        <span className="block text-xs text-slate-500">{relativeDay(e.date, today)} · {e.all_day || !e.start_time ? "All day" : time(e.start_time)}</span>
                      </span>
                      <span className={`size-2 shrink-0 rounded-full ${e.dot}`} style={e.dotColor ? { backgroundColor: e.dotColor } : undefined} />
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
    const message = editing.repeat === "none" ? toArchive(`“${editing.title}”`) : toArchive(`“${editing.title}” (it repeats, so every day of it)`);
    if (!(await confirm({ title: "Delete this event?", message }))) return;
    try {
      await api(`/events/${editing.id}`, { method: "DELETE" });
      await refresh("/events");
      toast("Event moved to the Archive");
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
