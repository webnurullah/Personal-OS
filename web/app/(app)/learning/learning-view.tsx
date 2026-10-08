"use client";

import { toArchive } from "@/lib/archive";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { ArrowUpRight, BookOpen, ChartColumn, ChevronLeft, ChevronRight, Clock, GraduationCap, Lightbulb, Minus, Pencil, Plus, Sparkles, Target, Timer, Trash2 } from "lucide-react";
import { api, errorMessage, refresh } from "@/lib/api";
import { addDays, formatDate, mondayOf, weekdayIndex } from "@/lib/dates";
import { hm, num, pct } from "@/lib/format";
import { useNewAction } from "@/lib/new-action";
import type { LearningWeek, StudyBlock } from "@/lib/types";
import { Progress } from "@/components/ui/charts";
import { Field } from "@/components/ui/controls";
import { useFeedback } from "@/components/ui/feedback";
import { Modal, ModalActions } from "@/components/ui/modal";
import { LoadError, PageHeader, PageSkeleton } from "@/components/ui/states";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function LearningView() {
  const [week, setWeek] = useState<string | null>(null); // Monday of the week on screen; null = this week
  const { data, error, mutate } = useSWR<LearningWeek>(week ? `/learning/week?start=${week}` : "/learning/week");
  const { toast, confirm } = useFeedback();
  const [logging, setLogging] = useState(false);
  const [newCourse, setNewCourse] = useState(false);
  const [editingTopic, setEditingTopic] = useState(false);
  useNewAction(() => setLogging(true));

  if (error && !data) return <LoadError error={error} retry={() => mutate()} />;
  if (!data) return <PageSkeleton />;

  const thisWeek = mondayOf(data.today);
  const isThisWeek = data.week_start === thisWeek;
  const done = data.blocks.filter((b) => b.done).reduce((sum, b) => sum + Number(b.hours), 0);
  const planned = data.blocks.reduce((sum, b) => sum + Number(b.hours), 0);
  const goal = Number(data.goal_hours);
  const left = Math.max(goal - done, 0);
  const share = Math.min(100, pct(done, goal));

  const run = async (work: () => Promise<unknown>, message?: string) => {
    try {
      await work();
      if (message) toast(message);
    } catch (e) {
      toast(errorMessage(e), "error");
    }
    await refresh("/learning");
  };

  const setGoal = (hours: number) => run(() => api(`/learning/week/${data.week_start}`, { method: "PUT", body: { goal_hours: Math.min(100, Math.max(0.5, hours)) } }));
  const saveTopic = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const topic = String(new FormData(e.currentTarget).get("topic")).trim();
    setEditingTopic(false);
    run(() => api(`/learning/week/${data.week_start}`, { method: "PUT", body: { topic } }));
  };
  const toggle = async (block: StudyBlock) => {
    await mutate({ ...data, blocks: data.blocks.map((b) => (b.id === block.id ? { ...b, done: !b.done } : b)) }, { revalidate: false });
    run(() => api(`/learning/blocks/${block.id}`, { method: "PATCH", body: { done: !block.done } }));
  };
  const remove = async (block: StudyBlock) => {
    if (!(await confirm({ title: "Delete this block?", message: toArchive(`${DAYS[block.weekday]}: ${block.activity} (${num(block.hours)}h)`) }))) return;
    run(() => api(`/learning/blocks/${block.id}`, { method: "DELETE" }), "Block moved to the Archive");
  };

  return (
    <>
      <PageHeader title="Learning" description="Plan your study week and watch the hours add up.">
        <button type="button" className="btn btn-primary" onClick={() => setLogging(true)}>
          <Timer className="size-4" />
          Log Study Session
        </button>
      </PageHeader>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => setWeek(addDays(data.week_start, -7))} aria-label="Previous week">
          <ChevronLeft className="size-4" />
        </button>
        <p className="min-w-52 text-center text-sm font-semibold text-slate-700">
          {isThisWeek ? "This week" : "Week of"} · {formatDate(data.week_start, "short")} – {formatDate(addDays(data.week_start, 6), "short")}
        </p>
        <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => setWeek(addDays(data.week_start, 7))} aria-label="Next week">
          <ChevronRight className="size-4" />
        </button>
        {!isThisWeek && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setWeek(null)}>
            This week
          </button>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-5 2xl:grid-cols-[minmax(0,1fr)_24rem]">
        <section className="card p-5 sm:p-7" aria-labelledby="progress-title">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-4 sm:gap-5">
              <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-indigo-50 text-indigo-600 sm:size-18">
                <GraduationCap className="size-8 sm:size-9" />
              </span>
              <div>
                <h2 id="progress-title" className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Learning Progress</h2>
                <p className="mt-1 text-slate-500">Track your weekly study goal and remaining time.</p>
              </div>
            </div>
            <p className="flex items-center gap-2.5 self-start rounded-full bg-emerald-50 px-5 py-2.5 font-semibold text-emerald-800 ring-1 ring-emerald-100 lg:self-auto">
              <ChartColumn className="size-5 text-emerald-600" />
              {share}% of weekly goal completed
            </p>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex items-center gap-4 rounded-2xl bg-slate-50 p-5 ring-1 ring-slate-100">
              <BookOpen className="size-9 shrink-0 fill-blue-100 text-blue-500" />
              <div className="min-w-0 flex-1">
                <p className="text-slate-500">Topic This Week:</p>
                {editingTopic ? (
                  <form onSubmit={saveTopic} className="mt-1 flex gap-2">
                    <input name="topic" className="input h-9" defaultValue={data.topic} maxLength={120} autoFocus placeholder="e.g. Data Analytics Basics" />
                    <button type="submit" className="btn btn-primary btn-sm">Save</button>
                  </form>
                ) : (
                  <button type="button" className="group flex max-w-full items-center gap-2 text-left" onClick={() => setEditingTopic(true)}>
                    <span className="truncate text-xl font-bold text-slate-900">{data.topic || "Add a topic"}</span>
                    <Pencil className="reveal size-4 shrink-0 text-slate-400" />
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4 rounded-2xl bg-slate-50 p-5 ring-1 ring-slate-100">
              <Target className="size-9 shrink-0 text-violet-500" />
              <div className="flex-1">
                <p className="text-slate-500">Weekly Goal:</p>
                <p className="text-xl font-bold text-slate-900">{num(goal)} hours</p>
              </div>
              <div className="flex items-center gap-1" aria-label="Change weekly goal">
                <button type="button" className="btn btn-secondary btn-sm btn-icon" onClick={() => setGoal(goal - 0.5)} disabled={goal <= 0.5} aria-label="Half an hour less">
                  <Minus className="size-4" />
                </button>
                <button type="button" className="btn btn-secondary btn-sm btn-icon" onClick={() => setGoal(goal + 0.5)} aria-label="Half an hour more">
                  <Plus className="size-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_17rem] md:items-center">
            <div>
              <div className="flex items-end justify-between gap-3 font-semibold">
                <p className="text-slate-800"><span className="text-lg">{hm(done)}</span> completed</p>
                <p className="text-slate-500">{hm(left)} remaining</p>
              </div>
              <Progress value={share} fill="bg-linear-to-r from-emerald-500 to-emerald-400" track="bg-slate-100" className="mt-3 h-4" />
            </div>
            <div className="flex items-center gap-4 rounded-2xl bg-emerald-50 p-5 ring-1 ring-emerald-100">
              <Clock className="size-9 shrink-0 text-emerald-600" />
              <div>
                <p className="text-sm text-emerald-800">Remaining This Week:</p>
                <p className="text-2xl font-bold text-slate-900">{left ? hm(left) : "Goal reached!"}</p>
              </div>
            </div>
          </div>

          <div className="mt-7 border-t border-slate-100 pt-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-semibold text-slate-900">Planned Learning Blocks</h3>
              <p className={`text-sm ${planned < goal ? "text-amber-600" : "text-slate-500"}`}>
                Your blocks cover {hm(planned)} of your {hm(goal)} goal.{planned < goal && ` Plan ${hm(goal - planned)} more.`}
              </p>
            </div>
            {data.blocks.length ? (
              <ul className="mt-4 space-y-3">
                {data.blocks.map((block) => (
                  <li key={block.id} className="group grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 rounded-2xl border border-slate-200 bg-white px-3 py-3.5 md:grid-cols-[auto_8rem_4rem_minmax(0,1fr)_auto_auto] md:gap-x-6 md:px-4">
                    <input type="checkbox" className="checkbox checkbox-green checkbox-lg" checked={block.done} onChange={() => toggle(block)} aria-label={`Done: ${DAYS[block.weekday]}, ${block.activity}`} />
                    <span className="whitespace-nowrap font-semibold text-slate-900">{DAYS[block.weekday]}</span>
                    <span className="text-slate-600 md:border-l md:border-slate-200 md:pl-6">{num(block.hours)}h</span>
                    <span className="col-span-2 col-start-2 row-start-2 min-w-0 text-slate-700 md:col-span-1 md:col-start-auto md:row-start-auto md:border-l md:border-slate-200 md:pl-6">{block.activity}</span>
                    <span className={`col-start-4 row-start-2 justify-self-end badge px-3 py-1 text-sm font-semibold md:col-start-auto md:row-start-auto ${block.done ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100" : "bg-slate-100 text-slate-600"}`}>
                      {block.done ? "Completed" : "Pending"}
                    </span>
                    <button type="button" className="btn btn-ghost btn-sm btn-icon reveal col-start-4 row-start-1 justify-self-end md:col-start-auto md:row-start-auto" onClick={() => remove(block)} aria-label="Remove block">
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                No blocks planned for this week.{" "}
                <button type="button" className="font-medium text-blue-600" onClick={() => setLogging(true)}>Plan a study block</button>
              </p>
            )}
          </div>

          <p className="mt-6 flex items-center gap-3 border-t border-slate-100 pt-5 text-slate-500">
            <Lightbulb className="size-6 shrink-0 fill-amber-200 text-amber-500" />
            You can set any weekly hours and mark sessions done as you learn.
          </p>
        </section>

        <aside className="space-y-5">
          <section className="card p-5" aria-labelledby="courses-title">
            <div className="flex items-center justify-between">
              <h2 id="courses-title" className="card-title">My courses</h2>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setNewCourse(true)}>
                <Plus className="size-4" /> New
              </button>
            </div>
            {data.courses.length ? (
              <ul className="mt-4 space-y-3">
                {data.courses.map((course) => (
                  <li key={course.id}>
                    <Link href={`/learning/${course.id}`} className="group block rounded-2xl border border-slate-200 p-4 transition hover:border-blue-200 hover:bg-blue-50/40">
                      <div className="flex items-start gap-3">
                        <span className="icon-tile size-10 bg-[#12305a] text-white">
                          <GraduationCap className="size-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 font-semibold leading-snug text-slate-900">{course.title}</p>
                          <p className="text-xs text-slate-500">
                            {course.unit_count} units · {course.topic_count} topics · due {formatDate(course.target_date, "date")}
                          </p>
                        </div>
                        <ArrowUpRight className="size-4 shrink-0 text-slate-400 transition group-hover:text-blue-600" />
                      </div>
                      <div className="mt-3 flex items-center gap-3">
                        <Progress value={course.percent} fill="bg-emerald-500" className="h-2 flex-1" />
                        <span className="text-xs font-semibold text-slate-600">{course.percent}%</span>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        {num(course.done_hours)}h of {num(course.est_hours)}h done · {course.days_left >= 0 ? `${Math.ceil(course.days_left / 7)} weeks left` : "target date passed"}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-slate-500">Track a course unit by unit. Add one with “New”.</p>
            )}
          </section>

          <section className="rounded-2xl bg-linear-to-br from-indigo-600 to-blue-600 p-5 text-white shadow-lg shadow-indigo-600/20">
            <Sparkles className="size-6 text-amber-300" />
            <p className="font-hand mt-3 text-3xl leading-tight">“Small steps every week make big progress.”</p>
            <p className="mt-2 text-sm text-indigo-100">Two short sessions beat one long one. Your memory likes repeats.</p>
          </section>
        </aside>
      </div>

      <Modal open={logging} onClose={() => setLogging(false)} title="Log a study session" description="It is added as a block for this week." size="md">
        <SessionForm weekStart={data.week_start} today={data.today} onClose={() => setLogging(false)} />
      </Modal>
      <Modal open={newCourse} onClose={() => setNewCourse(false)} title="New course" description="Then add its units and topics on the course page.">
        <CourseForm today={data.today} onClose={() => setNewCourse(false)} />
      </Modal>
    </>
  );
}

function SessionForm({ weekStart, today, onClose }: { weekStart: string; today: string; onClose: () => void }) {
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);
  const isThisWeek = mondayOf(today) === weekStart;

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const hours = Number(form.get("hours"));
    const done = form.get("done") === "on";
    setBusy(true);
    try {
      await api("/learning/blocks", { method: "POST", body: { week_start: weekStart, weekday: Number(form.get("weekday")), hours, activity: String(form.get("activity")), done } });
      await refresh("/learning");
      toast(done ? `${hm(hours)} added to this week` : "Block planned");
      onClose();
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Day" htmlFor="session-day">
          <select id="session-day" name="weekday" className="select select-lg" defaultValue={isThisWeek ? weekdayIndex(today) : 0}>
            {DAYS.map((day, i) => (
              <option key={day} value={i}>{day}</option>
            ))}
          </select>
        </Field>
        <Field label="Hours" htmlFor="session-hours">
          <input id="session-hours" name="hours" type="number" min={0.25} max={24} step={0.25} defaultValue={1} className="input" required />
        </Field>
      </div>
      <Field label="What did you study?" htmlFor="session-what">
        <input id="session-what" name="activity" className="input" required maxLength={200} placeholder="e.g. SQL joins practice" autoComplete="off" autoFocus />
      </Field>
      <label className="flex items-center gap-3 text-sm text-slate-700">
        <input type="checkbox" name="done" className="checkbox checkbox-green" defaultChecked />
        Already done (counts towards this week)
      </label>
      <ModalActions onCancel={onClose} submitLabel="Add block" busy={busy} />
    </form>
  );
}

export function CourseForm({ today, onClose, course }: { today: string; onClose: () => void; course?: { id: string; title: string; subtitle: string; quote: string; start_date: string; target_date: string } }) {
  const { toast } = useFeedback();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const body = {
      title: String(form.get("title")),
      subtitle: String(form.get("subtitle")),
      quote: String(form.get("quote")),
      start_date: String(form.get("start_date")),
      target_date: String(form.get("target_date")),
    };
    setBusy(true);
    try {
      const saved = await api<{ id: string }>(course ? `/courses/${course.id}` : "/courses", { method: course ? "PATCH" : "POST", body });
      await refresh("/courses", "/learning");
      toast(course ? "Course saved" : "Course created");
      onClose();
      if (!course) router.push(`/learning/${saved.id}`);
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Course name" htmlFor="course-title">
        <input id="course-title" name="title" className="input" required maxLength={300} defaultValue={course?.title} placeholder="e.g. Level 4 Award in IQA" autoComplete="off" autoFocus />
      </Field>
      <Field label="Subtitle" htmlFor="course-subtitle">
        <input id="course-subtitle" name="subtitle" className="input" maxLength={120} defaultValue={course?.subtitle ?? "Personal Learning Progress Tracker"} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Start date" htmlFor="course-start" hint="Week 1 starts on that week's Monday.">
          <input id="course-start" name="start_date" type="date" className="input" required defaultValue={course?.start_date ?? today} />
        </Field>
        <Field label="Target date" htmlFor="course-target">
          <input id="course-target" name="target_date" type="date" className="input" required defaultValue={course?.target_date ?? addDays(today, 112)} />
        </Field>
      </div>
      <Field label="Motto (optional)" htmlFor="course-quote">
        <input id="course-quote" name="quote" className="input" maxLength={200} defaultValue={course?.quote} placeholder="Plan your learning. Track your progress. Achieve your goal." />
      </Field>
      <ModalActions onCancel={onClose} submitLabel={course ? "Save course" : "Create course"} busy={busy} />
    </form>
  );
}
