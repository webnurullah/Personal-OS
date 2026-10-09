"use client";

import { toArchive } from "@/lib/archive";
import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { CalendarCheck, CalendarDays, ChevronLeft, ClipboardPaste, Clock, GraduationCap, Hourglass, Layers, ListPlus, Pencil, Plus, Route, Target, Trash2 } from "lucide-react";
import { api, ApiError, errorMessage, refresh } from "@/lib/api";
import { cacheMutate } from "@/lib/cache";
import { colorOf } from "@/lib/colors";
import { courseStats, doneHours, nextNumber, timeLeft } from "@/lib/course";
import { addDays, formatDate, mondayOf, weekdayIndex } from "@/lib/dates";
import { hm, num, pct, plural } from "@/lib/format";
import { sessionLabel } from "@/lib/study";
import type { CourseDetail, Topic, TopicStatus, Unit } from "@/lib/types";
import { useProfile } from "@/lib/profile";
import { useMedia } from "@/lib/use-media";
import { useSaveLater } from "@/lib/use-save-later";
import { Donut, Progress } from "@/components/ui/charts";
import { ColorPicker, Field } from "@/components/ui/controls";
import { useFeedback } from "@/components/ui/feedback";
import { Modal, ModalActions } from "@/components/ui/modal";
import { EmptyState, LoadError, PageSkeleton } from "@/components/ui/states";
import { CourseLibrary } from "../library/course-library";
import { CourseForm } from "../learning-view";
import { OutlineDialog, PlanDialog } from "./planning-dialogs";

const STATUSES: { value: TopicStatus; label: string }[] = [
  { value: "not-started", label: "Not Started" },
  { value: "in-progress", label: "In Progress" },
  { value: "done", label: "Completed" },
];

const unitName = (unit: Pick<Unit, "code" | "title">) => unit.title || `Unit ${unit.code}`;

type TopicModal = { unitId: string; topic?: Topic };

const clampHours = (value: number, max: number) => Math.min(max, Math.max(0, value));

/**
 * A number box for hours that saves as you type. While you are typing it shows what you typed; when you leave it, it shows
 * the value that is saved (the limits applied, or the number the database kept instead, for example a total that cannot
 * be lower than the study sessions), so what is on screen is never different from what is stored.
 */
function HoursBox({ value, max, label, className, onValue }: { value: number; max: number; label: string; className: string; onValue: (hours: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      type="number"
      min={0}
      max={max}
      step={0.25}
      value={draft ?? (value ? String(value) : "")}
      placeholder="–"
      className={className}
      aria-label={label}
      onFocus={() => setDraft(value ? String(value) : "")}
      onChange={(e) => {
        setDraft(e.target.value);
        // A half-typed number ("-", "1e", ".") reads as empty: nothing is saved until it is a number (or really empty).
        if (e.target.value === "" && e.target.validity.badInput) return;
        const hours = e.target.value === "" ? 0 : e.target.valueAsNumber;
        if (!Number.isNaN(hours)) onValue(clampHours(hours, max));
      }}
      onBlur={(e) => {
        setDraft(null);
        // Leftover junk text is cleared, so the box shows the saved value (or nothing) again.
        if (e.currentTarget.validity.badInput) e.currentTarget.value = "";
      }}
    />
  );
}

export function CourseView({ id }: { id: string }) {
  const router = useRouter();
  const { data, error, mutate } = useSWR<CourseDetail>(`/courses/${id}`);
  const { toast, confirm } = useFeedback();
  const saveLater = useSaveLater();
  const wide = useMedia("(min-width: 40rem)"); // one layout of the topics at a time: cards on a phone, the table from tablet up
  const [syncKey, setSyncKey] = useState(0); // changes after a failed save so the number boxes start again from the real values
  // What a topic's fields were before a series of unsaved changes (typing a number sends many): a failed save goes back to these.
  const baseline = useRef(new Map<string, Record<string, unknown>>());
  // The newest change made to each topic: an answer to an older save must not undo a newer one.
  const newest = useRef(new Map<string, number>());
  const [editingCourse, setEditingCourse] = useState(false);
  const [unitModal, setUnitModal] = useState<Unit | "new" | null>(null);
  const [topicModal, setTopicModal] = useState<TopicModal | null>(null);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const { profile } = useProfile();
  const weeklyGoal = Number(profile?.weekly_study_goal ?? 5);

  if (error && !data) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) {
      return (
        <div className="card mt-6">
          <EmptyState icon={GraduationCap} title="Course not found" text="It may have been deleted.">
            <Link href="/learning" className="btn btn-secondary">Back to Learning</Link>
          </EmptyState>
        </div>
      );
    }
    return <LoadError error={error} retry={() => mutate()} />;
  }
  if (!data) return <PageSkeleton />;

  const { course, units, today } = data;
  const stats = courseStats<Topic, Unit>(course, units, today);
  const weekStartDate = addDays(course.start_date, (stats.thisWeek - 1) * 7);
  const started = today >= course.start_date;
  const ended = today > course.target_date;

  const failed = async (e: unknown, undo?: () => void) => {
    toast(errorMessage(e), "error");
    undo?.(); // back to what was saved, also when there is no connection to ask again
    // Then ask again; the number boxes are made new only once the saved values are back.
    await mutate().catch(() => undefined);
    setSyncKey((k) => k + 1);
  };

  /** Puts a topic's values back to what they were before the changes that could not be saved. */
  const revertTopic = (topic: Topic, keys: string[]) => {
    const was = baseline.current.get(topic.id) ?? {};
    const back = Object.fromEntries(keys.map((k) => [k, k in was ? was[k] : topic[k as keyof Topic]]));
    for (const k of keys) delete was[k];
    return mutate(
      (current) => current && { ...current, units: current.units.map((u) => (u.id !== topic.unit_id ? u : { ...u, topics: u.topics.map((t) => (t.id === topic.id ? { ...t, ...back } : t)) })) },
      { revalidate: false },
    );
  };

  /** Shows the change at once, then saves it (straight away, or once typing stops). */
  const changeTopic = (topic: Topic, changes: Partial<Pick<Topic, "status" | "actual_hours">>, later = false) => {
    const was = baseline.current.get(topic.id) ?? {};
    for (const k of Object.keys(changes)) if (!(k in was)) was[k] = topic[k as keyof Topic]; // the saved value, before the first of these changes
    baseline.current.set(topic.id, was);
    const version = (newest.current.get(topic.id) ?? 0) + 1;
    newest.current.set(topic.id, version);
    mutate(
      (current) =>
        current && {
          ...current,
          units: current.units.map((u) => (u.id !== topic.unit_id ? u : { ...u, topics: u.topics.map((t) => (t.id === topic.id ? { ...t, ...changes } : t)) })),
        },
      { revalidate: false },
    );
    const save = () =>
      api<Topic>(`/topics/${topic.id}`, { method: "PATCH", body: changes }).then(
        (saved) => {
          for (const k of Object.keys(changes)) delete baseline.current.get(topic.id)?.[k];
          // Only the newest change shows the answer: an older save that comes back late must not put its answer over what was typed since.
          if ("actual_hours" in changes && newest.current.get(topic.id) === version) {
            // The database sets the Spent total: it cannot be lower than the study sessions on the topic. Show what it kept
            // (the box follows the data: the one being typed in keeps what is typed until it is left).
            if (Math.abs(Number(saved.actual_hours) - Number(changes.actual_hours)) > 0.001) {
              mutate((current) => current && { ...current, units: current.units.map((u) => (u.id !== topic.unit_id ? u : { ...u, topics: u.topics.map((t) => (t.id === topic.id ? { ...t, actual_hours: saved.actual_hours } : t)) })) }, { revalidate: false });
            }
            // And ask again, so a copy that was refreshed while this save was waiting cannot stay on screen.
            mutate().catch(() => undefined);
          }
          return refresh("/learning");
        },
        (e) => failed(e, () => revertTopic(topic, Object.keys(changes))),
      );
    if (later) saveLater(`topic-${topic.id}`, save);
    else save();
  };

  const changePlan = (week: number, hours: number) => {
    const plan = stats.plan.map((h, i) => (i === week ? hours : h)).slice(0, 156);
    mutate((current) => current && { ...current, course: { ...current.course, weekly_plan: plan } }, { revalidate: false });
    saveLater("plan", () => {
      api(`/courses/${course.id}`, { method: "PATCH", body: { weekly_plan: plan } }).catch(failed);
    });
  };

  /**
   * "+30m" / "+1h" on a topic adds a finished study session for today that names the topic: one record, so the Learning
   * page, the week's hours and the topic's Spent hours all agree (the database adds the hours to the topic).
   */
  const logTime = async (topic: Topic, hours: number) => {
    // A number typed in the Spent box and still waiting to be saved goes first, so the session is added on top of it.
    await saveLater.flush(`topic-${topic.id}`);
    mutate(
      (current) =>
        current && {
          ...current,
          units: current.units.map((u) =>
            u.id !== topic.unit_id
              ? u
              : { ...u, topics: u.topics.map((t) => (t.id === topic.id ? { ...t, actual_hours: Number(t.actual_hours) + hours, status: t.status === "not-started" ? "in-progress" : t.status } : t)) },
          ),
        },
      { revalidate: false },
    );
    try {
      await api("/learning/blocks", { method: "POST", body: { week_start: mondayOf(today), weekday: weekdayIndex(today), hours, activity: sessionLabel(topic), topic_id: topic.id, done: true } });
      toast(`${hm(hours)} added to ${topic.code}`);
      await refresh("/learning", "/courses");
    } catch (e) {
      // Take this tap's hours off again (other taps that are still on their way keep theirs).
      await failed(e, () =>
        mutate(
          (current) => current && { ...current, units: current.units.map((u) => (u.id !== topic.unit_id ? u : { ...u, topics: u.topics.map((t) => (t.id === topic.id ? (() => { const left = Math.max(0, Number(t.actual_hours) - hours); return { ...t, actual_hours: left, status: topic.status === "not-started" && t.status === "in-progress" && left === 0 ? "not-started" : t.status }; })() : t)) })) },
          { revalidate: false },
        ),
      );
    }
  };

  /** A task for each topic still to study in this week's plan (due at the end of the week); pressing it twice adds nothing twice. */
  const addWeekTasks = async () => {
    try {
      const made = await api<{ created: number; skipped: number; due_date: string }>(`/courses/${course.id}/tasks`, { method: "POST", body: {} });
      await refresh("/tasks");
      toast(made.created ? `${plural(made.created, "task")} added, due ${formatDate(made.due_date, "short")}${made.skipped ? ` (${made.skipped} already there)` : ""}` : "Those topics are already in your tasks.");
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  const toggleDone = (topic: Topic) =>
    changeTopic(topic, { status: topic.status === "done" ? (Number(topic.actual_hours) > 0 ? "in-progress" : "not-started") : "done" });

  const removeCourse = async () => {
    const ok = await confirm({ title: "Delete this course?", message: toArchive(`“${course.title}” and all its units, topics and logged hours`), action: "Delete course" });
    if (!ok) return;
    try {
      await api(`/courses/${course.id}`, { method: "DELETE" });
      // Forget the saved copy of this page, so Back or another tab cannot bring the deleted course back.
      cacheMutate(`/courses/${course.id}`, undefined, { revalidate: false }).catch(() => undefined);
      await refresh("/learning");
      toast("Course moved to the Archive");
      router.push("/learning");
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  const tiles = [
    { label: "Total Learning Time", icon: Target, box: "bg-blue-50 ring-blue-100", tint: "text-blue-600", value: num(stats.total), unit: "hours", note: "(Estimated)", valueColor: "text-[#12305a]" },
    { label: "Time Completed", icon: Clock, box: "bg-emerald-50 ring-emerald-100", tint: "text-emerald-600", value: num(stats.done), unit: "hours", note: `(${stats.progress}%)`, valueColor: "text-emerald-800" },
    { label: "Time Remaining", icon: Hourglass, box: "bg-amber-50 ring-amber-100", tint: "text-amber-600", value: num(stats.left), unit: "hours", note: `(${pct(stats.left, stats.total)}%)`, valueColor: "text-[#12305a]" },
  ];

  return (
    <>
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/learning" className="flex shrink-0 items-center gap-1 whitespace-nowrap hover:text-blue-600">
          <ChevronLeft className="size-4" />
          Learning
        </Link>
        <span>/</span>
        <span className="min-w-0 truncate text-slate-700">{course.title}</span>
      </nav>

      {/* Title + key numbers */}
      <div className="mt-4 grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] 2xl:items-center">
        <div className="flex gap-4">
          <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-[#12305a] text-white shadow-lg shadow-blue-900/20">
            <GraduationCap className="size-9" />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold leading-tight tracking-tight text-[#12305a] sm:text-[1.65rem]">{course.title}</h1>
            {course.subtitle && <p className="mt-1 text-lg text-slate-700">{course.subtitle}</p>}
            {course.quote && <p className="font-hand text-2xl text-slate-600">“{course.quote}”</p>}
            <div className="mt-2 flex gap-1">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditingCourse(true)}>
                <Pencil className="size-4" /> Edit course
              </button>
              <button type="button" className="btn btn-ghost btn-sm text-rose-600" onClick={removeCourse}>
                <Trash2 className="size-4" /> Delete
              </button>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {tiles.map((tile) => (
            <div key={tile.label} className={`rounded-2xl p-3 text-center ring-1 sm:p-4 ${tile.box}`}>
              <p className="flex items-center justify-center gap-2 text-[13px] font-semibold leading-tight text-slate-700">
                <tile.icon className={`size-5 shrink-0 ${tile.tint}`} />
                {tile.label}
              </p>
              <p className={`mt-2 font-bold ${tile.valueColor}`}>
                <span className="text-2xl sm:text-3xl">{tile.value}</span> <span className="text-base sm:text-lg">{tile.unit}</span>
              </p>
              <p className="text-sm text-slate-500">{tile.note}</p>
            </div>
          ))}
          <div className="rounded-2xl bg-violet-50 p-3 text-center ring-1 ring-violet-100 sm:p-4">
            <p className="flex items-center justify-center gap-2 text-[13px] font-semibold leading-tight text-slate-700">
              <CalendarCheck className="size-5 shrink-0 text-violet-600" />
              Target Date
            </p>
            <p className="mt-2 text-xl font-bold leading-9 text-[#12305a] sm:text-2xl">{formatDate(course.target_date, "gb")}</p>
            <p className="text-sm text-slate-500">({timeLeft(stats.daysLeft)})</p>
          </div>
        </div>
      </div>

      {/* Overview row */}
      <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2 2xl:grid-cols-[1fr_1.15fr_1.3fr_0.85fr]">
        <section className="card flex items-center justify-center gap-6 p-5" aria-label="Course progress">
          <div className="relative size-32 shrink-0 sm:size-36 2xl:size-32 min-[112.5rem]:size-36">
            <Donut
              segments={[
                { value: stats.ring.done, color: "#059669" },
                { value: stats.ring.inProgress, color: "#3b82f6" },
                { value: stats.ring.notStarted, color: "#cbd5e1" },
              ]}
              thickness={14}
              className="absolute inset-0"
            />
            <p className="absolute inset-0 grid place-content-center text-3xl font-bold text-[#12305a]">{stats.progress}%</p>
          </div>
          <ul className="space-y-2.5 whitespace-nowrap text-sm text-slate-700">
            <li className="flex items-center gap-2"><span className="size-3 rounded-full bg-emerald-600" />Completed</li>
            <li className="flex items-center gap-2"><span className="size-3 rounded-full bg-blue-500" />In Progress</li>
            <li className="flex items-center gap-2"><span className="size-3 rounded-full bg-slate-300" />Not Started</li>
          </ul>
        </section>

        <section className="card p-5" aria-labelledby="module-title">
          <h2 id="module-title" className="text-lg font-bold text-[#12305a]">Module Progress</h2>
          {stats.units.length ? (
            <ul className="mt-4 space-y-3.5 text-sm">
              {stats.units.map(({ unit, est, percent }) => (
                <li key={unit.id}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate font-medium text-slate-700">
                      {unitName(unit)} <span className="text-slate-400">({num(est)}h)</span>
                    </span>
                    <span className="shrink-0 font-semibold text-slate-700">{percent}%</span>
                  </div>
                  <Progress value={percent} fill={colorOf(unit.color).bar} className="mt-1.5 h-2" />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-slate-500">Add units to see progress per module.</p>
          )}
        </section>

        <section className="card p-5" aria-labelledby="week-title">
          <div className="flex items-center gap-3">
            <span className="icon-tile size-10 bg-[#12305a] text-white">
              <CalendarDays className="size-5" />
            </span>
            <div>
              <h2 id="week-title" className="text-lg font-bold leading-tight text-[#12305a]">{ended ? "Last Week's Plan" : started ? "This Week's Plan" : "First Week's Plan"}</h2>
              <p className="text-sm font-semibold text-slate-500">
                (Week {stats.thisWeek} · {formatDate(weekStartDate, "short")} – {formatDate(addDays(weekStartDate, 6), "short")})
              </p>
            </div>
          </div>
          {stats.weekTopics.length ? (
            <ul className="mt-4 space-y-2.5 text-sm">
              {stats.weekTopics.map((topic) => (
                <li key={topic.id} className="flex items-center gap-2.5">
                  <input id={`wk-${topic.id}`} type="checkbox" className="checkbox checkbox-green peer" checked={topic.status === "done"} onChange={() => toggleDone(topic)} />
                  <label htmlFor={`wk-${topic.id}`} className="text-slate-700 peer-checked:text-slate-400 peer-checked:line-through">
                    {topic.code} {topic.short_title || topic.title}
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-slate-500">No topics planned for this week. Give topics a week in the table below.</p>
          )}
          {stats.weekTopics.some((t) => t.status !== "done") && (
            <button type="button" className="btn btn-secondary btn-sm mt-4" onClick={addWeekTasks}>
              <ListPlus className="size-4" /> Add to my tasks
            </button>
          )}
        </section>

        <section className="flex flex-col justify-center rounded-[1.25rem] bg-pink-50 p-6 text-center ring-1 ring-pink-100">
          <p className="font-hand text-3xl leading-tight text-slate-800">“Small steps every week make big progress.”</p>
          <svg viewBox="0 0 80 8" className="mx-auto mt-3 w-20 text-slate-700" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M2 5c20-3 50-4 76-2" />
          </svg>
        </section>
      </div>

      {/* Topics table */}
      <section className="card mt-5 overflow-hidden" aria-labelledby="topics-title">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
          <h2 id="topics-title" className="flex items-center gap-2 text-lg font-bold text-[#12305a]">
            <Layers className="size-5" /> Topics
          </h2>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setOutlineOpen(true)}>
              <ClipboardPaste className="size-4" /> Paste outline
            </button>
            {units.length > 0 && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setPlanOpen(true)}>
                <Route className="size-4" /> Plan weeks
              </button>
            )}
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setUnitModal("new")}>
              <Plus className="size-4" /> Add unit
            </button>
          </div>
        </div>
        {units.length && !wide ? (
          <div className="divide-y divide-slate-100">
            {stats.units.map(({ unit, est }) => (
              <div key={unit.id}>
                <button type="button" className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left ${colorOf(unit.color).soft}`} onClick={() => setUnitModal(unit)}>
                  <span className="min-w-0">
                    <span className="block font-bold text-[#12305a]">{unitName(unit)}</span>
                    <span className="text-sm font-normal text-slate-600">({num(est)} hours)</span>
                  </span>
                  <Pencil className="size-4 shrink-0 text-slate-500" aria-hidden />
                  <span className="sr-only">Edit unit {unitName(unit)}</span>
                </button>
                <ul className="divide-y divide-slate-100">
                  {unit.topics.map((topic) => (
                    <li key={topic.id} className="space-y-2 px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-slate-800">
                            <span className="text-slate-500">{topic.code}</span> {topic.title}
                          </p>
                          {topic.outcome && <p className="mt-0.5 text-sm text-slate-600">{topic.outcome}</p>}
                          {topic.notes && <p className="mt-0.5 text-xs text-slate-500">{topic.notes}</p>}
                        </div>
                        <button type="button" className="btn btn-ghost btn-sm btn-icon -mr-2 shrink-0" onClick={() => setTopicModal({ unitId: unit.id, topic })} aria-label={`Edit topic ${topic.code}`}>
                          <Pencil className="size-4" />
                        </button>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-slate-600">
                        <select
                          className="select status-select h-8 w-auto text-xs"
                          data-status={topic.status}
                          value={topic.status}
                          onChange={(e) => changeTopic(topic, { status: e.target.value as TopicStatus })}
                          aria-label={`Status of topic ${topic.code}`}
                        >
                          {STATUSES.map((st) => (
                            <option key={st.value} value={st.value}>{st.label}</option>
                          ))}
                        </select>
                        <span>{num(Number(topic.est_hours))}h planned</span>
                        {topic.planned_week ? <span className={topic.planned_week === stats.thisWeek ? "font-semibold text-blue-700" : ""}>W{topic.planned_week}</span> : null}
                        <label className="flex items-center gap-1.5">
                          <span>Spent</span>
                          <HoursBox
                            key={`${topic.id}-${syncKey}`}
                            value={Number(topic.actual_hours)}
                            max={1000}
                            className="cell-input w-16"
                            label={`Actual hours for topic ${topic.code}`}
                            onValue={(hours) => changeTopic(topic, { actual_hours: hours }, true)}
                          />
                          <span>h</span>
                        </label>
                        {topic.status !== "done" && (
                          <span className="flex gap-1.5">
                            {[0.5, 1].map((h) => (
                              <button key={h} type="button" className="btn btn-secondary btn-sm h-8 px-2.5 text-xs" onClick={() => logTime(topic, h)} aria-label={`Add ${hm(h)} to topic ${topic.code}`}>
                                +{hm(h)}
                              </button>
                            ))}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                  <li className="px-2 py-1">
                    <button type="button" className="btn btn-ghost btn-sm max-w-full text-slate-500" onClick={() => setTopicModal({ unitId: unit.id })}>
                      <Plus className="size-4 shrink-0" /> <span className="min-w-0 truncate">Add topic to {unitName(unit)}</span>
                    </button>
                  </li>
                </ul>
              </div>
            ))}
            <p className="flex flex-wrap justify-between gap-x-4 gap-y-1 bg-[#e8f1fc] px-4 py-3 text-sm font-bold text-slate-900">
              <span>Total</span>
              <span>{num(stats.total)}h planned · {num(stats.spent)}h spent · {num(stats.left)}h left</span>
            </p>
          </div>
        ) : null}
        {units.length && wide ? (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[1220px] border-collapse text-sm">
              <thead className="bg-[#e8f1fc] text-xs font-semibold text-slate-700">
                <tr>
                  <th className="w-28 px-4 py-3 text-center">Unit</th>
                  <th className="w-12 px-2 py-3"></th>
                  <th className="px-3 py-3 text-left">Topic / Learning Outcome</th>
                  <th className="px-3 py-3 text-left">What I Will Learn</th>
                  <th className="w-20 px-2 py-3 text-center">Estimated<br />Time (Hours)</th>
                  <th className="w-16 px-2 py-3 text-center">Week<br />Plan</th>
                  <th className="w-36 px-2 py-3 text-center">Status</th>
                  <th className="w-24 px-2 py-3 text-center">Actual Time<br />Spent (Hours)</th>
                  <th className="w-24 px-2 py-3 text-center">Remaining<br />Time (Hours)</th>
                  <th className="px-3 py-3 text-left">Notes / Resources</th>
                  <th className="w-12 px-2 py-3"><span className="sr-only">Edit</span></th>
                </tr>
              </thead>
              {stats.units.map(({ unit, est }) => {
                const unitCell = (
                  <th scope="rowgroup" rowSpan={unit.topics.length + 1} className={`border-r border-white px-3 text-center align-middle ${colorOf(unit.color).soft}`}>
                    <button type="button" className="group rounded-lg px-1 py-1 hover:bg-white/60" onClick={() => setUnitModal(unit)} title="Edit unit">
                      <span className="block text-lg font-bold text-[#12305a]">{unitName(unit)}</span>
                      <span className="text-sm font-normal text-slate-600">({num(est)} hours)</span>
                      <Pencil className="reveal mx-auto mt-1 size-3.5 text-slate-400" />
                    </button>
                  </th>
                );
                return (
                  <tbody key={unit.id} className="border-t-4 border-white">
                    {unit.topics.map((topic, i) => (
                      <tr key={topic.id} className="group border-t border-slate-100">
                        {i === 0 && unitCell}
                        <td className="px-2 py-2 text-center text-slate-500">{topic.code}</td>
                        <td className="px-3 py-2 text-slate-800">{topic.title}</td>
                        <td className="px-3 py-2 text-slate-600">{topic.outcome}</td>
                        <td className="px-2 py-2 text-center">{num(Number(topic.est_hours))}</td>
                        <td className={`px-2 py-2 text-center ${topic.planned_week === stats.thisWeek ? "font-semibold text-blue-700" : "text-slate-600"}`}>
                          {topic.planned_week ? `W${topic.planned_week}` : "–"}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <select
                            className="select status-select h-7 text-xs"
                            data-status={topic.status}
                            value={topic.status}
                            onChange={(e) => changeTopic(topic, { status: e.target.value as TopicStatus })}
                            aria-label={`Status of topic ${topic.code}`}
                          >
                            {STATUSES.map((s) => (
                              <option key={s.value} value={s.value}>{s.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-2 text-center">
                          <HoursBox
                            key={`${topic.id}-${syncKey}`}
                            value={Number(topic.actual_hours)}
                            max={1000}
                            className="cell-input"
                            label={`Actual hours for topic ${topic.code}`}
                            onValue={(hours) => changeTopic(topic, { actual_hours: hours }, true)}
                          />
                        </td>
                        <td className="px-2 py-2 text-center font-medium text-slate-700">{num(Number(topic.est_hours) - doneHours(topic))}</td>
                        <td className="max-w-56 truncate px-3 py-2 text-slate-600" title={topic.notes}>{topic.notes}</td>
                        <td className="px-2 py-2 text-center">
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm btn-icon reveal"
                            onClick={() => setTopicModal({ unitId: unit.id, topic })}
                            aria-label={`Edit topic ${topic.code}`}
                          >
                            <Pencil className="size-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t border-slate-100">
                      {unit.topics.length === 0 && unitCell}
                      <td colSpan={10} className="px-2 py-1.5">
                        <button type="button" className="btn btn-ghost btn-sm text-slate-500" onClick={() => setTopicModal({ unitId: unit.id })}>
                          <Plus className="size-4" /> Add topic to {unitName(unit)}
                        </button>
                      </td>
                    </tr>
                  </tbody>
                );
              })}
              <tfoot className="border-t-2 border-slate-200 bg-[#e8f1fc] text-sm font-bold text-slate-900">
                <tr>
                  <th className="px-4 py-3 text-center text-base">Total</th>
                  <td colSpan={3}></td>
                  <td className="px-2 py-3 text-center">{num(stats.total)}</td>
                  <td className="px-2 py-3 text-center">–</td>
                  <td className="px-2 py-3 text-center">–</td>
                  <td className="px-2 py-3 text-center">{num(stats.spent)}</td>
                  <td className="px-2 py-3 text-center">{num(stats.left)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : null}
        {units.length === 0 && (
          <EmptyState icon={Layers} title="No units yet" text="Paste an outline (or pick a template) to fill the whole course in one go, or add the units one by one.">
            <button type="button" className="btn btn-primary" onClick={() => setOutlineOpen(true)}>
              <ClipboardPaste className="size-4" /> Paste an outline
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setUnitModal("new")}>
              <Plus className="size-4" /> Add a unit
            </button>
          </EmptyState>
        )}
      </section>

      {/* Certificate courses and playlists collected for this subject */}
      <CourseLibrary course={course} />

      {/* Weekly plan + overall progress */}
      <div className="mt-5 grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1fr)_24rem]">
        <section className="card min-w-0 p-5" aria-labelledby="plan-title">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="plan-title" className="flex flex-wrap items-center gap-x-2.5 text-lg font-bold text-[#12305a]">
              <CalendarDays className="size-5" />
              Weekly Learning Plan <span className="text-sm font-medium text-slate-500">(Set Your Own Schedule)</span>
            </h2>
            <p className={`text-sm ${stats.plannedTotal < stats.total ? "text-amber-600" : "text-slate-500"}`}>
              {num(stats.plannedTotal)}h planned for {num(stats.total)}h of topics.
            </p>
          </div>
          <div className="relative mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-center text-sm" style={{ minWidth: `${8 + stats.weeks * 3.75}rem` }}>
              <tbody>
                <tr className="bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="w-32 border border-slate-100 px-3 py-2 text-left">Week</th>
                  {stats.plan.map((_, i) => (
                    <th key={i} className={`border border-slate-100 px-1 py-2 ${i + 1 === stats.thisWeek && started ? "bg-blue-100 text-blue-800" : ""}`} title={`Starts ${formatDate(addDays(course.start_date, i * 7), "date")}`}>
                      W{i + 1}
                    </th>
                  ))}
                </tr>
                <tr>
                  <th className="border border-slate-100 px-3 py-1.5 text-left font-medium text-slate-700">Planned Hours</th>
                  {stats.plan.map((hours, i) => (
                    <td key={i} className="border border-slate-100 px-0.5 py-1">
                      <HoursBox
                        key={syncKey}
                        value={hours}
                        max={80}
                        className="cell-input w-full max-w-14"
                        label={`Planned hours for week ${i + 1}`}
                        onValue={(value) => changePlan(i, value)}
                      />
                    </td>
                  ))}
                </tr>
                <tr>
                  <th className="border border-slate-100 px-3 py-2 text-left font-medium text-slate-700">Actual Hours</th>
                  {stats.actualByWeek.map((hours, i) => (
                    <td
                      key={i}
                      className={`border border-slate-100 px-1 py-2 font-medium ${hours ? (hours >= stats.plan[i] ? "bg-emerald-50 text-emerald-700" : "text-slate-700") : "text-slate-300"}`}
                    >
                      {hours ? num(hours) : "–"}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-500">Actual hours add up the time logged on topics planned for that week.</p>
        </section>

        <section className="flex flex-col justify-center rounded-[1.25rem] bg-[#e8f1fc] p-6 ring-1 ring-blue-100" aria-labelledby="overall-title">
          <h2 id="overall-title" className="text-lg font-bold text-[#12305a]">Overall Progress</h2>
          <div className="mt-3 flex items-center gap-4">
            <Progress value={stats.progress} fill="bg-emerald-600" track="bg-white" className="h-4 flex-1" />
            <span className="text-2xl font-bold text-[#12305a]">{stats.progress}%</span>
          </div>
          <p className="mt-3 text-sm text-slate-600">
            {stats.total === 0
              ? "Add topics with estimated hours to see your pace."
              : stats.left <= 0
                ? "Every topic is done. Congratulations!"
                : stats.pace === null
                  ? "The target date has passed. Set a new one with “Edit course”."
                  : `About ${num(stats.pace)}h a week gets you there by ${formatDate(course.target_date, "gb")}.`}
          </p>
          <p className="font-hand mt-2 text-2xl text-slate-700">“Consistent effort leads to success.”</p>
        </section>
      </div>

      <Modal open={editingCourse} onClose={() => setEditingCourse(false)} title="Edit course">
        <CourseForm today={today} course={course} onClose={() => setEditingCourse(false)} />
      </Modal>
      <Modal open={outlineOpen} onClose={() => setOutlineOpen(false)} title="Paste an outline" description="Units and topics are added after what the course already has." size="lg">
        {outlineOpen && (
          <OutlineDialog
            course={course}
            hasPlan={units.some((u) => u.topics.some((t) => t.planned_week != null))}
            weeklyGoal={weeklyGoal}
            onClose={() => setOutlineOpen(false)}
            onDone={() => setSyncKey((k) => k + 1)}
          />
        )}
      </Modal>
      <Modal open={planOpen} onClose={() => setPlanOpen(false)} title="Plan the weeks" description="Give the topics that are left a week each, from this week to the target date." size="md">
        {planOpen && (
          <PlanDialog
            course={course}
            topics={units.flatMap((u) => u.topics)}
            today={today}
            weeklyGoal={weeklyGoal}
            onClose={() => setPlanOpen(false)}
            onDone={() => setSyncKey((k) => k + 1)}
          />
        )}
      </Modal>
      <Modal open={unitModal !== null} onClose={() => setUnitModal(null)} title={unitModal === "new" ? "Add unit" : "Edit unit"} size="sm">
        {unitModal !== null && (
          <UnitForm
            courseId={course.id}
            unit={unitModal === "new" ? undefined : unitModal}
            codes={units.map((u) => ({ id: u.id, code: u.code }))}
            onClose={() => setUnitModal(null)}
            onSaved={() => mutate()}
          />
        )}
      </Modal>
      <Modal open={topicModal !== null} onClose={() => setTopicModal(null)} title={topicModal?.topic ? `Edit topic ${topicModal.topic.code}` : "Add topic"} size="lg">
        {topicModal !== null && (
          <TopicForm
            courseId={course.id}
            units={units}
            unitId={topicModal.unitId}
            topic={topicModal.topic}
            weeks={stats.weeks}
            thisWeek={stats.thisWeek}
            onClose={() => setTopicModal(null)}
            onSaved={() => mutate()}
          />
        )}
      </Modal>
    </>
  );
}

/** Warns (does not block) when a number is already used by something else in the same list. */
function CodeWarning({ used }: { used: boolean }) {
  return used ? <p className="mt-1 text-xs text-amber-600">That number is already used. Pick another so the list stays clear.</p> : null;
}

function UnitForm({ courseId, unit, codes, onClose, onSaved }: { courseId: string; unit?: Unit; codes: { id: string; code: string }[]; onClose: () => void; onSaved: () => void }) {
  const { toast, confirm } = useFeedback();
  const [busy, setBusy] = useState(false);
  // One more than the highest number in use, so a number is not handed out twice after a unit was deleted.
  const nextCode = String(nextNumber(codes.map((c) => c.code)));
  const [code, setCode] = useState(unit?.code ?? nextCode);
  const used = codes.some((c) => c.id !== unit?.id && c.code === code.trim());

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const body = { code: String(form.get("code")), title: String(form.get("title")), color: String(form.get("color")) };
    setBusy(true);
    try {
      await api(unit ? `/units/${unit.id}` : `/courses/${courseId}/units`, { method: unit ? "PATCH" : "POST", body });
      onSaved();
      await refresh("/learning");
      toast(unit ? "Unit saved" : "Unit added");
      onClose();
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!unit) return;
    const ok = await confirm({
      title: `Delete ${unitName(unit)}?`,
      message: toArchive(unit.topics.length ? `${unitName(unit)} and its ${plural(unit.topics.length, "topic")} with their logged hours` : unitName(unit)),
    });
    if (!ok) return;
    try {
      await api(`/units/${unit.id}`, { method: "DELETE" });
      onSaved();
      await refresh("/learning");
      toast("Unit moved to the Archive");
      onClose();
    } catch (error) {
      toast(errorMessage(error), "error");
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-[6rem_1fr] gap-3">
        <Field label="Number" htmlFor="unit-code">
          <input id="unit-code" name="code" className="input" required maxLength={10} value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Name" htmlFor="unit-title">
          <input id="unit-title" name="title" className="input" maxLength={200} defaultValue={unit?.title ?? `Unit ${nextCode}`} autoComplete="off" autoFocus />
        </Field>
      </div>
      <CodeWarning used={used} />
      <Field label="Colour">
        <ColorPicker name="color" value={unit?.color ?? "blue"} />
      </Field>
      <ModalActions
        onCancel={onClose}
        submitLabel={unit ? "Save unit" : "Add unit"}
        busy={busy}
        left={
          unit && (
            <button type="button" className="btn btn-ghost text-rose-600" onClick={remove}>
              <Trash2 className="size-4" /> Delete
            </button>
          )
        }
      />
    </form>
  );
}

function TopicForm({ courseId, units, unitId, topic, weeks, thisWeek, onClose, onSaved }: {
  courseId: string;
  units: Unit[];
  unitId: string;
  topic?: Topic;
  weeks: number;
  thisWeek: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast, confirm } = useFeedback();
  const [busy, setBusy] = useState(false);
  const [pickedUnit, setPickedUnit] = useState(unitId);
  const unit = units.find((u) => u.id === pickedUnit) ?? units[0];
  // The proposed number follows the unit chosen (one more than the highest in it, so none is handed out twice).
  const proposal = (u: Unit) => `${u.code}.${nextNumber(u.topics.map((t) => t.code))}`;
  const [code, setCode] = useState(topic?.code ?? proposal(unit));
  const [codeEdited, setCodeEdited] = useState(false);
  const used = unit.topics.some((t) => t.id !== topic?.id && t.code === code.trim());
  // A week beyond the end of the course (left over from a shorter target date) stays visible instead of vanishing.
  const lastWeek = Math.max(weeks, topic?.planned_week ?? 0);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const week = String(form.get("planned_week"));
    const planned_week = week ? Number(week) : null;
    const body = {
      code: String(form.get("code")),
      title: String(form.get("title")),
      short_title: String(form.get("short_title")),
      outcome: String(form.get("outcome")),
      est_hours: Number(form.get("est_hours")),
      // An unchanged week is not sent again: a week left beyond the course end would otherwise block every other edit.
      ...(topic && planned_week === topic.planned_week ? {} : { planned_week }),
      notes: String(form.get("notes")),
    };
    setBusy(true);
    try {
      if (topic) await api(`/topics/${topic.id}`, { method: "PATCH", body });
      else await api(`/courses/${courseId}/topics`, { method: "POST", body: { ...body, unit_id: String(form.get("unit_id")) } });
      onSaved();
      await refresh("/learning");
      toast(topic ? "Topic saved" : "Topic added");
      onClose();
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!topic) return;
    if (!(await confirm({ title: `Delete topic ${topic.code}?`, message: toArchive(`“${topic.title}”`) }))) return;
    try {
      await api(`/topics/${topic.id}`, { method: "DELETE" });
      onSaved();
      await refresh("/learning");
      toast("Topic moved to the Archive");
      onClose();
    } catch (error) {
      toast(errorMessage(error), "error");
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-[1fr_6rem]">
        <Field label="Unit" htmlFor="topic-unit">
          <select
            id="topic-unit"
            name="unit_id"
            className="select select-lg"
            value={unit.id}
            disabled={Boolean(topic)}
            onChange={(e) => {
              setPickedUnit(e.target.value);
              const next = units.find((u) => u.id === e.target.value);
              if (next && !codeEdited && !topic) setCode(proposal(next));
            }}
          >
            {units.map((u) => (
              <option key={u.id} value={u.id}>{unitName(u)}</option>
            ))}
          </select>
        </Field>
        <Field label="Number" htmlFor="topic-code">
          <input
            id="topic-code"
            name="code"
            className="input"
            required
            maxLength={10}
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setCodeEdited(true);
            }}
            autoComplete="off"
          />
        </Field>
      </div>
      <CodeWarning used={used} />
      <Field label="Topic / learning outcome" htmlFor="topic-title">
        <input id="topic-title" name="title" className="input" required maxLength={300} defaultValue={topic?.title} autoComplete="off" autoFocus />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Short name" htmlFor="topic-short" hint="Shown in “This Week's Plan”.">
          <input id="topic-short" name="short_title" className="input" maxLength={80} defaultValue={topic?.short_title} autoComplete="off" />
        </Field>
        <Field label="What I will learn" htmlFor="topic-outcome">
          <input id="topic-outcome" name="outcome" className="input" maxLength={300} defaultValue={topic?.outcome} autoComplete="off" />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Estimated hours" htmlFor="topic-est">
          <input id="topic-est" name="est_hours" type="number" min={0.25} max={500} step={0.25} className="input" required defaultValue={topic ? Number(topic.est_hours) : 3} />
        </Field>
        <Field label="Planned week" htmlFor="topic-week">
          <select id="topic-week" name="planned_week" className="select select-lg" defaultValue={topic ? (topic.planned_week ?? "") : thisWeek}>
            <option value="">Not planned</option>
            {Array.from({ length: lastWeek }, (_, i) => (
              <option key={i} value={i + 1}>{i + 1 > weeks ? `Week ${i + 1} (after the end)` : `Week ${i + 1}`}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Notes / resources" htmlFor="topic-notes">
        <input id="topic-notes" name="notes" className="input" maxLength={300} defaultValue={topic?.notes} autoComplete="off" />
      </Field>
      <ModalActions
        onCancel={onClose}
        submitLabel={topic ? "Save topic" : "Add topic"}
        busy={busy}
        left={
          topic && (
            <button type="button" className="btn btn-ghost text-rose-600" onClick={remove}>
              <Trash2 className="size-4" /> Delete
            </button>
          )
        }
      />
    </form>
  );
}
