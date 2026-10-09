"use client";

import { toArchive } from "@/lib/archive";
import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { ArrowUpRight, BookOpen, ChartColumn, ChevronLeft, ChevronRight, Clock, GraduationCap, Lightbulb, Minus, Pencil, Plus, Sparkles, Target, Timer, Trash2 } from "lucide-react";
import { api, errorMessage, refresh } from "@/lib/api";
import { addDays, formatDate, mondayOf, weekdayIndex } from "@/lib/dates";
import { COURSE_TEMPLATES, templateWeeks } from "@/lib/course-templates";
import { timeLeft } from "@/lib/course";
import { hm, num, pct, plural } from "@/lib/format";
import { useNewAction } from "@/lib/new-action";
import { parseOutline } from "@/lib/outline";
import { useProfile } from "@/lib/profile";
import { forecastText } from "@/lib/study";
import type { LearningWeek, StudyBlock, StudyNextItem } from "@/lib/types";
import { useSaveLater } from "@/lib/use-save-later";
import { Progress } from "@/components/ui/charts";
import { Field } from "@/components/ui/controls";
import { useFeedback } from "@/components/ui/feedback";
import { Modal, ModalActions } from "@/components/ui/modal";
import { LoadError, PageHeader, PageSkeleton } from "@/components/ui/states";
import { LearningTabs } from "./learning-tabs";
import { StudyNext } from "./study-next";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function LearningView() {
  const [week, setWeek] = useState<string | null>(null); // Monday of the week on screen; null = this week
  const { data, error, mutate } = useSWR<LearningWeek>(week ? `/learning/week?start=${week}` : "/learning/week");
  const { toast, confirm } = useFeedback();
  const saveLater = useSaveLater(500);
  const [logging, setLogging] = useState(false);
  const [logChoice, setLogChoice] = useState(""); // what the session form starts on: "t:<topic id>", "r:<library item id>" or nothing
  const [logNow, setLogNow] = useState(false); // from "Study next" (always about today): this week, even when another week is on screen
  const [newCourse, setNewCourse] = useState(false);
  const [editingTopic, setEditingTopic] = useState(false);
  const openLog = (choice = "", now = false) => {
    setLogChoice(choice);
    setLogNow(now);
    setLogging(true);
  };
  useNewAction(() => openLog());

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
    // Topic hours follow the sessions, so the courses are reloaded as well.
    await refresh("/learning", "/courses");
  };

  // Shown at once, saved once the clicking stops: fast clicks add up instead of each starting from the old value.
  const setGoal = (hours: number) => {
    const goal_hours = Math.min(100, Math.max(0.5, hours));
    const weekStart = data.week_start;
    mutate({ ...data, goal_hours }, { revalidate: false });
    saveLater(`goal-${weekStart}`, () => {
      run(() => api(`/learning/week/${weekStart}`, { method: "PUT", body: { goal_hours } }));
    });
  };
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

  const finishTopic = (item: StudyNextItem) =>
    run(() => api(`/topics/${item.topic_id}`, { method: "PATCH", body: { status: "done" } }), `${item.code} marked finished`);

  return (
    <>
      <PageHeader title="Learning" description="Plan your study week and watch the hours add up.">
        <button type="button" className="btn btn-primary" onClick={() => openLog()}>
          <Timer className="size-4" />
          Log Study Session
        </button>
      </PageHeader>
      <LearningTabs current="courses" />

      <StudyNext data={data} onLog={(topicId) => openLog(`t:${topicId}`, true)} onFinish={finishTopic} />

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => setWeek(addDays(week ?? thisWeek, -7))} aria-label="Previous week">
          <ChevronLeft className="size-4" />
        </button>
        <p className="min-w-52 text-center text-sm font-semibold text-slate-700">
          {isThisWeek ? "This week" : "Week of"} · {formatDate(data.week_start, "short")} – {formatDate(addDays(data.week_start, 6), "short")}
        </p>
        <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => setWeek(addDays(week ?? thisWeek, 7))} aria-label="Next week">
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
                <button type="button" className="font-medium text-blue-600" onClick={() => openLog()}>Plan a study block</button>
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
                            {plural(course.unit_count, "unit")} · {plural(course.topic_count, "topic")} · due {formatDate(course.target_date, "date")}
                          </p>
                        </div>
                        <ArrowUpRight className="size-4 shrink-0 text-slate-400 transition group-hover:text-blue-600" />
                      </div>
                      <div className="mt-3 flex items-center gap-3">
                        <Progress value={course.percent} fill="bg-emerald-500" className="h-2 flex-1" />
                        <span className="text-xs font-semibold text-slate-600">{course.percent}%</span>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        {num(course.done_hours)}h of {num(course.est_hours)}h done · {timeLeft(course.days_left)}
                      </p>
                      {course.state === "behind" && (
                        <p className="mt-1 text-xs font-medium text-amber-700">
                          Behind: {hm(course.behind_hours)} to catch up{course.weeks_behind > 0 ? ` (${plural(course.weeks_behind, "week")} late)` : ""}
                        </p>
                      )}
                      {course.forecast && course.state !== "done" && <p className="mt-1 text-xs text-slate-500">{forecastText(course.forecast)}</p>}
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

      <Modal
        open={logging}
        onClose={() => setLogging(false)}
        title="Log a study session"
        description={isThisWeek || logNow ? "It is added as a block for this week." : `It is added to the week of ${formatDate(data.week_start, "short")}.`}
        size="md"
      >
        <SessionForm data={data} weekStart={logNow ? thisWeek : data.week_start} choice={logChoice} onClose={() => setLogging(false)} />
      </Modal>
      <Modal open={newCourse} onClose={() => setNewCourse(false)} title="New course" description="Then add its units and topics on the course page.">
        <CourseForm today={data.today} onClose={() => setNewCourse(false)} />
      </Modal>
    </>
  );
}

function SessionForm({ data, weekStart, choice: firstChoice, onClose }: { data: LearningWeek; weekStart: string; choice: string; onClose: () => void }) {
  const { toast } = useFeedback();
  const { today } = data;
  // (A copy of this page saved before topics and the library were listed has neither; the fresh answer replaces it a moment later.)
  const openTopics = data.open_topics ?? [];
  const library = data.library ?? [];
  const [busy, setBusy] = useState(false);
  const isThisWeek = mondayOf(today) === weekStart;
  const [day, setDay] = useState(isThisWeek ? weekdayIndex(today) : 0);
  // "Already done" is on for today and days gone by, off for a day still to come — until you choose yourself.
  const isPast = addDays(weekStart, day) <= today;
  const [doneChoice, setDoneChoice] = useState<boolean | null>(null);
  const done = doneChoice ?? isPast;

  // What it was about: a topic of a course (its hours then count there), a library item, or nothing in particular.
  const [choice, setChoice] = useState(firstChoice);
  const topic = choice.startsWith("t:") ? openTopics.find((t) => t.id === choice.slice(2)) : undefined;
  const item = choice.startsWith("r:") ? library.find((r) => r.id === choice.slice(2)) : undefined;
  const [activity, setActivity] = useState(topic?.label ?? item?.title ?? "");
  const [auto, setAuto] = useState(topic?.label ?? item?.title ?? ""); // the words filled in from the pick
  const [finish, setFinish] = useState(false);
  const pick = (value: string) => {
    setChoice(value);
    setFinish(false);
    // Words you wrote yourself stay. Words that are still the old pick's (even with something added) follow the new pick.
    if (activity.trim() && !(auto && activity.startsWith(auto))) return;
    const t = value.startsWith("t:") ? openTopics.find((o) => o.id === value.slice(2)) : undefined;
    const r = value.startsWith("r:") ? library.find((o) => o.id === value.slice(2)) : undefined;
    const label = t?.label ?? r?.title ?? "";
    setAuto(label);
    setActivity(label);
  };

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const hours = Number(new FormData(e.currentTarget).get("hours"));
    setBusy(true);
    try {
      await api("/learning/blocks", {
        method: "POST",
        body: { week_start: weekStart, weekday: day, hours, activity: activity.trim(), done, topic_id: topic?.id ?? null, resource_id: item?.id ?? null },
      });
      if (topic && finish) {
        try {
          await api(`/topics/${topic.id}`, { method: "PATCH", body: { status: "done" } });
        } catch (error) {
          toast(`The session was added, but the topic could not be marked finished: ${errorMessage(error)}`, "error");
        }
      }
      await refresh("/learning", "/courses");
      toast(done ? `${hm(hours)} added to ${isThisWeek ? "this week" : "the week of " + formatDate(weekStart, "short")}` : "Block planned");
      onClose();
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {(openTopics.length > 0 || library.length > 0) && (
        <Field label="What are you studying?" htmlFor="session-pick" hint={topic ? `${hm(topic.hours_left)} left on this topic. A finished session adds its hours to it.` : undefined}>
          <select id="session-pick" className="select select-lg" value={topic || item ? choice : ""} onChange={(e) => pick(e.target.value)}>
            <option value="">Something else</option>
            {data.courses.map((course) => {
              const open = openTopics.filter((t) => t.course_id === course.id);
              return open.length ? (
                <optgroup key={course.id} label={course.title}>
                  {open.map((t) => (
                    <option key={t.id} value={`t:${t.id}`}>{t.label}</option>
                  ))}
                </optgroup>
              ) : null;
            })}
            {library.length > 0 && (
              <optgroup label="Library: learning now">
                {library.map((r) => (
                  <option key={r.id} value={`r:${r.id}`}>{r.title}</option>
                ))}
              </optgroup>
            )}
          </select>
        </Field>
      )}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Day" htmlFor="session-day">
          <select id="session-day" name="weekday" className="select select-lg" value={day} onChange={(e) => setDay(Number(e.target.value))}>
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
        <input
          id="session-what"
          name="activity"
          className="input"
          required
          maxLength={200}
          placeholder="e.g. SQL joins practice"
          autoComplete="off"
          autoFocus={!topic && !item}
          value={activity}
          onChange={(e) => setActivity(e.target.value)}
        />
      </Field>
      <label className="flex items-center gap-3 text-sm text-slate-700">
        <input type="checkbox" name="done" className="checkbox checkbox-green" checked={done} onChange={(e) => setDoneChoice(e.target.checked)} />
        Already done (counts towards {isThisWeek ? "this week" : "that week"}{topic ? " and the topic" : ""})
      </label>
      {topic && (
        <label className="flex items-center gap-3 text-sm text-slate-700">
          <input type="checkbox" className="checkbox checkbox-green" checked={finish} onChange={(e) => setFinish(e.target.checked)} />
          I finished this topic
        </label>
      )}
      <ModalActions onCancel={onClose} submitLabel="Add block" busy={busy} />
    </form>
  );
}

export function CourseForm({ today, onClose, course }: { today: string; onClose: () => void; course?: { id: string; title: string; subtitle: string; quote: string; start_date: string; target_date: string } }) {
  const { toast } = useFeedback();
  const router = useRouter();
  const { profile } = useProfile();
  const weeklyGoal = Number(profile?.weekly_study_goal ?? 5);
  const [busy, setBusy] = useState(false);
  // New course only: a template (or a pasted outline) fills the title, the dates and the units and topics.
  const [title, setTitle] = useState(course?.title ?? "");
  const [subtitle, setSubtitle] = useState(course?.subtitle ?? "Personal Learning Progress Tracker");
  const [start, setStart] = useState(course?.start_date ?? today);
  const [target, setTarget] = useState(course?.target_date ?? addDays(today, 112));
  const [targetTouched, setTargetTouched] = useState(false);
  const [templateKey, setTemplateKey] = useState("");
  const [outline, setOutline] = useState("");
  const template = COURSE_TEMPLATES.find((t) => t.key === templateKey);
  const parsed = useMemo(() => parseOutline(outline), [outline]);
  const weeks = useMemo(() => (outline.trim() && parsed.topicCount ? templateWeeks({ outline, weeklyHours: weeklyGoal }, weeklyGoal, parsed) : 0), [outline, parsed, weeklyGoal]);
  // The target date follows the outline (weeks at your weekly goal) until you choose a date yourself.
  const suggested = weeks ? addDays(mondayOf(start), weeks * 7 - 1) : null;
  const shownTarget = !course && suggested && !targetTouched ? suggested : target;

  const chooseTemplate = (key: string) => {
    setTemplateKey(key);
    const t = COURSE_TEMPLATES.find((x) => x.key === key);
    if (!t) {
      setOutline("");
      return;
    }
    setOutline(t.outline);
    if (!title.trim()) setTitle(t.title);
    if (subtitle === "Personal Learning Progress Tracker") setSubtitle(t.subtitle);
  };

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const body = {
      title: title.trim(),
      subtitle: subtitle.trim(),
      quote: String(form.get("quote")),
      start_date: start,
      target_date: shownTarget,
    };
    setBusy(true);
    try {
      const saved = await api<{ id: string }>(course ? `/courses/${course.id}` : "/courses", { method: course ? "PATCH" : "POST", body });
      if (!course && outline.trim() && parsed.topicCount) {
        try {
          await api(`/courses/${saved.id}/outline`, { method: "POST", body: { text: outline, plan: true, weekly_hours: weeklyGoal } });
        } catch (error) {
          toast(`The course was created, but its outline could not be added: ${errorMessage(error)}`, "error");
        }
      }
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
      {!course && (
        <Field label="Start from" htmlFor="course-template" hint={template ? `${plural(parsed.units.length, "unit")}, ${plural(parsed.topicCount, "topic")}, ${hm(parsed.hours)}. You can change the text below.` : "A template fills in the units and topics for you."}>
          <select id="course-template" className="select select-lg" value={templateKey} onChange={(e) => chooseTemplate(e.target.value)}>
            <option value="">A blank course</option>
            {COURSE_TEMPLATES.map((t) => (
              <option key={t.key} value={t.key}>{t.title}</option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Course name" htmlFor="course-title">
        <input id="course-title" name="title" className="input" required maxLength={300} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Level 4 Award in IQA" autoComplete="off" autoFocus />
      </Field>
      <Field label="Subtitle" htmlFor="course-subtitle">
        <input id="course-subtitle" name="subtitle" className="input" maxLength={120} value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Start date" htmlFor="course-start" hint="Week 1 starts on that week's Monday.">
          <input id="course-start" name="start_date" type="date" className="input" required value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="Target date" htmlFor="course-target" hint={!course && suggested && !targetTouched ? `${plural(weeks, "week")} at your goal of ${num(weeklyGoal)}h a week.` : undefined}>
          <input
            id="course-target"
            name="target_date"
            type="date"
            className="input"
            required
            value={shownTarget}
            onChange={(e) => {
              setTarget(e.target.value);
              setTargetTouched(true);
            }}
          />
        </Field>
      </div>
      <Field label="Motto (optional)" htmlFor="course-quote">
        <input id="course-quote" name="quote" className="input" maxLength={200} defaultValue={course?.quote} placeholder="Plan your learning. Track your progress. Achieve your goal." />
      </Field>
      {!course && (
        <details className="rounded-2xl border border-slate-200 p-3" open={Boolean(outline)}>
          <summary className="cursor-pointer text-sm font-medium text-slate-700">{outline ? "Outline: units and topics to add" : "Or paste an outline (optional)"}</summary>
          <textarea
            id="course-outline"
            aria-label="Outline"
            className="input mt-3 min-h-40 font-mono text-sm"
            value={outline}
            onChange={(e) => {
              setOutline(e.target.value);
              setTemplateKey("");
            }}
            placeholder={"Unit 1: SEO basics\n- What is SEO | 1h\n- Keyword research | 2.5h"}
            spellCheck={false}
          />
          <p className="mt-2 text-xs text-slate-500">One unit per line, its topics under it starting with “-”, hours at the end (2h, 90m). The weeks are planned for you.</p>
        </details>
      )}
      <ModalActions onCancel={onClose} submitLabel={course ? "Save course" : "Create course"} busy={busy} />
    </form>
  );
}
