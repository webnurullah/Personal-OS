"use client";

import { toArchive } from "@/lib/archive";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { CalendarCheck, CalendarDays, ChevronLeft, Clock, GraduationCap, Hourglass, Layers, Pencil, Plus, Target, Trash2 } from "lucide-react";
import { api, ApiError, errorMessage, refresh } from "@/lib/api";
import { colorOf } from "@/lib/colors";
import { courseStats, doneHours } from "@/lib/course";
import { addDays, formatDate } from "@/lib/dates";
import { num, pct, plural } from "@/lib/format";
import type { CourseDetail, Topic, TopicStatus, Unit } from "@/lib/types";
import { Donut, Progress } from "@/components/ui/charts";
import { ColorPicker, Field } from "@/components/ui/controls";
import { useFeedback } from "@/components/ui/feedback";
import { Modal, ModalActions } from "@/components/ui/modal";
import { EmptyState, LoadError, PageSkeleton } from "@/components/ui/states";
import { CourseForm } from "../learning-view";

const STATUSES: { value: TopicStatus; label: string }[] = [
  { value: "not-started", label: "Not Started" },
  { value: "in-progress", label: "In Progress" },
  { value: "done", label: "Completed" },
];

const unitName = (unit: Pick<Unit, "code" | "title">) => unit.title || `Unit ${unit.code}`;

/** Waits until typing stops before saving. Anything still waiting is saved when you leave the page. */
function useSaveLater(delay = 700) {
  const pending = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; save: () => void }>());
  useEffect(() => {
    const waiting = pending.current;
    return () => {
      waiting.forEach(({ timer, save }) => {
        clearTimeout(timer);
        save();
      });
      waiting.clear();
    };
  }, []);
  return (key: string, save: () => void) => {
    const waiting = pending.current;
    const old = waiting.get(key);
    if (old) clearTimeout(old.timer);
    const timer = setTimeout(() => {
      waiting.delete(key);
      save();
    }, delay);
    waiting.set(key, { timer, save });
  };
}

type TopicModal = { unitId: string; topic?: Topic };

export function CourseView({ id }: { id: string }) {
  const router = useRouter();
  const { data, error, mutate } = useSWR<CourseDetail>(`/courses/${id}`);
  const { toast, confirm } = useFeedback();
  const saveLater = useSaveLater();
  const [editingCourse, setEditingCourse] = useState(false);
  const [unitModal, setUnitModal] = useState<Unit | "new" | null>(null);
  const [topicModal, setTopicModal] = useState<TopicModal | null>(null);

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

  const failed = (e: unknown) => {
    toast(errorMessage(e), "error");
    mutate();
  };

  /** Shows the change at once, then saves it (straight away, or once typing stops). */
  const changeTopic = (topic: Topic, changes: Partial<Pick<Topic, "status" | "actual_hours">>, later = false) => {
    mutate(
      (current) =>
        current && {
          ...current,
          units: current.units.map((u) => (u.id !== topic.unit_id ? u : { ...u, topics: u.topics.map((t) => (t.id === topic.id ? { ...t, ...changes } : t)) })),
        },
      { revalidate: false },
    );
    const save = () => {
      api(`/topics/${topic.id}`, { method: "PATCH", body: changes }).then(() => refresh("/learning"), failed);
    };
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

  const toggleDone = (topic: Topic) =>
    changeTopic(topic, { status: topic.status === "done" ? (Number(topic.actual_hours) > 0 ? "in-progress" : "not-started") : "done" });

  const removeCourse = async () => {
    const ok = await confirm({ title: "Delete this course?", message: toArchive(`“${course.title}” and all its units, topics and logged hours`), action: "Delete course" });
    if (!ok) return;
    try {
      await api(`/courses/${course.id}`, { method: "DELETE" });
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
        <Link href="/learning" className="flex items-center gap-1 hover:text-blue-600">
          <ChevronLeft className="size-4" />
          Learning
        </Link>
        <span>/</span>
        <span className="truncate text-slate-700">{course.title}</span>
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
            <div key={tile.label} className={`rounded-2xl p-4 text-center ring-1 ${tile.box}`}>
              <p className="flex items-center justify-center gap-2 text-[13px] font-semibold leading-tight text-slate-700">
                <tile.icon className={`size-5 shrink-0 ${tile.tint}`} />
                {tile.label}
              </p>
              <p className={`mt-2 whitespace-nowrap font-bold ${tile.valueColor}`}>
                <span className="text-3xl">{tile.value}</span> <span className="text-lg">{tile.unit}</span>
              </p>
              <p className="text-sm text-slate-500">{tile.note}</p>
            </div>
          ))}
          <div className="rounded-2xl bg-violet-50 p-4 text-center ring-1 ring-violet-100">
            <p className="flex items-center justify-center gap-2 text-[13px] font-semibold leading-tight text-slate-700">
              <CalendarCheck className="size-5 shrink-0 text-violet-600" />
              Target Date
            </p>
            <p className="mt-2 whitespace-nowrap text-2xl font-bold leading-9 text-[#12305a]">{formatDate(course.target_date, "gb")}</p>
            <p className="text-sm text-slate-500">
              ({stats.daysLeft < 0 ? "date passed" : stats.daysLeft < 7 ? plural(stats.daysLeft, "day") + " left" : plural(Math.ceil(stats.daysLeft / 7), "week") + " left"})
            </p>
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
                    <span className="truncate font-medium text-slate-700">
                      {unitName(unit)} <span className="text-slate-400">({num(est)}h)</span>
                    </span>
                    <span className="font-semibold text-slate-700">{percent}%</span>
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
              <h2 id="week-title" className="text-lg font-bold leading-tight text-[#12305a]">{started ? "This Week's Plan" : "First Week's Plan"}</h2>
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
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setUnitModal("new")}>
            <Plus className="size-4" /> Add unit
          </button>
        </div>
        {units.length ? (
          <div className="overflow-x-auto">
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
                      <Pencil className="mx-auto mt-1 size-3.5 text-slate-400 opacity-0 transition group-hover:opacity-100" />
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
                          <input
                            type="number"
                            min={0}
                            max={1000}
                            step={0.5}
                            defaultValue={Number(topic.actual_hours) || ""}
                            placeholder="–"
                            className="cell-input"
                            aria-label={`Actual hours for topic ${topic.code}`}
                            onChange={(e) => {
                              const value = e.target.value === "" ? 0 : e.target.valueAsNumber;
                              if (Number.isNaN(value)) return;
                              changeTopic(topic, { actual_hours: Math.min(1000, Math.max(0, value)) }, true);
                            }}
                          />
                        </td>
                        <td className="px-2 py-2 text-center font-medium text-slate-700">{num(Number(topic.est_hours) - doneHours(topic))}</td>
                        <td className="max-w-56 truncate px-3 py-2 text-slate-600" title={topic.notes}>{topic.notes}</td>
                        <td className="px-2 py-2 text-center">
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm btn-icon opacity-0 transition group-hover:opacity-100 focus:opacity-100"
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
        ) : (
          <EmptyState icon={Layers} title="No units yet" text="Split the course into units, then add the topics of each unit with their estimated hours.">
            <button type="button" className="btn btn-primary" onClick={() => setUnitModal("new")}>
              <Plus className="size-4" /> Add the first unit
            </button>
          </EmptyState>
        )}
      </section>

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
          <div className="mt-4 overflow-x-auto">
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
                      <input
                        type="number"
                        min={0}
                        max={80}
                        step={0.5}
                        defaultValue={hours || ""}
                        placeholder="–"
                        className="cell-input w-full max-w-14"
                        aria-label={`Planned hours for week ${i + 1}`}
                        onChange={(e) => {
                          const value = e.target.value === "" ? 0 : e.target.valueAsNumber;
                          if (!Number.isNaN(value)) changePlan(i, Math.min(80, Math.max(0, value)));
                        }}
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
      <Modal open={unitModal !== null} onClose={() => setUnitModal(null)} title={unitModal === "new" ? "Add unit" : "Edit unit"} size="sm">
        {unitModal !== null && (
          <UnitForm
            courseId={course.id}
            unit={unitModal === "new" ? undefined : unitModal}
            nextCode={String(units.length + 1)}
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

function UnitForm({ courseId, unit, nextCode, onClose, onSaved }: { courseId: string; unit?: Unit; nextCode: string; onClose: () => void; onSaved: () => void }) {
  const { toast, confirm } = useFeedback();
  const [busy, setBusy] = useState(false);

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
          <input id="unit-code" name="code" className="input" required maxLength={10} defaultValue={unit?.code ?? nextCode} autoComplete="off" />
        </Field>
        <Field label="Name" htmlFor="unit-title">
          <input id="unit-title" name="title" className="input" maxLength={200} defaultValue={unit?.title ?? `Unit ${nextCode}`} autoComplete="off" autoFocus />
        </Field>
      </div>
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
  const unit = units.find((u) => u.id === unitId) ?? units[0];

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const week = String(form.get("planned_week"));
    const body = {
      code: String(form.get("code")),
      title: String(form.get("title")),
      short_title: String(form.get("short_title")),
      outcome: String(form.get("outcome")),
      est_hours: Number(form.get("est_hours")),
      planned_week: week ? Number(week) : null,
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
          <select id="topic-unit" name="unit_id" className="select select-lg" defaultValue={unit.id} disabled={Boolean(topic)}>
            {units.map((u) => (
              <option key={u.id} value={u.id}>{unitName(u)}</option>
            ))}
          </select>
        </Field>
        <Field label="Number" htmlFor="topic-code">
          <input id="topic-code" name="code" className="input" required maxLength={10} defaultValue={topic?.code ?? `${unit.code}.${unit.topics.length + 1}`} autoComplete="off" />
        </Field>
      </div>
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
            {Array.from({ length: weeks }, (_, i) => (
              <option key={i} value={i + 1}>Week {i + 1}</option>
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
