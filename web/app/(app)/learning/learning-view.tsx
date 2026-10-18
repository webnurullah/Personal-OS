"use client";

import { toArchive } from "@/lib/archive";
import { colorOf } from "@/lib/colors";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { GraduationCap, Plus, Trash2 } from "lucide-react";
import { api, errorMessage, refresh } from "@/lib/api";
import { addDays, formatDate, mondayOf } from "@/lib/dates";
import { COURSE_TEMPLATES, templateWeeks } from "@/lib/course-templates";
import { hm, num, plural } from "@/lib/format";
import { spent } from "@/lib/project-time";
import { OUTLINE_LIMITS, parseOutline } from "@/lib/outline";
import { COURSE_STATUSES, remainingText } from "@/lib/course";
import { useProfile } from "@/lib/profile";
import { forecastText } from "@/lib/study";
import type { CourseStatus, CourseSummary, LearningWeek, StudyBlock } from "@/lib/types";
import { Progress } from "@/components/ui/charts";
import { Field, Segmented } from "@/components/ui/controls";
import { useFeedback } from "@/components/ui/feedback";
import { Modal, ModalActions } from "@/components/ui/modal";
import { LoadError, PageHeader, PageSkeleton } from "@/components/ui/states";
import { LearningToolbar } from "./learning-tabs";

const categoryKey = (category: string | undefined) => (category ?? "").trim().toLowerCase();
/** The categories in use, once each (spelled as first written), in order of name. */
function courseCategories(courses: CourseSummary[]) {
  const seen = new Map<string, string>();
  for (const c of courses) {
    const key = categoryKey(c.category);
    if (key && !seen.has(key)) seen.set(key, (c.category ?? "").trim());
  }
  return [...seen].map(([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label));
}

/** The badge on a course card: "Due in 20 days", "Due today", "Date passed". */
function courseTimeBadge(daysLeft: number) {
  if (daysLeft < 0) return "Date passed";
  if (daysLeft === 0) return "Due today";
  return `Due in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}`;
}

/** Where the New course dialog starts: a blank course, on the ready-made courses ("Ideas"), or on the box for a pasted outline. */
type NewCourseStart = "blank" | "ideas" | "list";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export function LearningView() {
  const { data, error, mutate } = useSWR<LearningWeek>("/learning/week");
  const [categoryPick, setCategoryPick] = useState("all"); // "all", a category's key (lower case), or "none" for courses without one
  const [statusPick, setStatusPick] = useState<CourseStatus>("active");
  const { toast, confirm } = useFeedback();
  const [newCourse, setNewCourse] = useState<NewCourseStart | null>(null); // the New course dialog, and where its cursor starts

  if (error && !data) return <LoadError error={error} retry={() => mutate()} />;
  if (!data) return <PageSkeleton />;

  const done = data.blocks.filter((b) => b.done).reduce((sum, b) => sum + Number(b.hours), 0);
  const planned = data.blocks.reduce((sum, b) => sum + Number(b.hours), 0);

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

  const toggle = async (block: StudyBlock) => {
    await mutate({ ...data, blocks: data.blocks.map((b) => (b.id === block.id ? { ...b, done: !b.done } : b)) }, { revalidate: false });
    run(() => api(`/learning/blocks/${block.id}`, { method: "PATCH", body: { done: !block.done } }));
  };
  const remove = async (block: StudyBlock) => {
    if (!(await confirm({ title: "Delete this block?", message: toArchive(`${DAYS[block.weekday]}: ${block.activity} (${num(block.hours)}h)`) }))) return;
    run(() => api(`/learning/blocks/${block.id}`, { method: "DELETE" }), "Block moved to the Archive");
  };

  // Courses by category (written by you in the course form) and by status, like the project list.
  const statusOf = (c: CourseSummary): CourseStatus => c.status ?? "active"; // (a copy saved before categories existed has neither)
  // The category buttons are the categories of the courses in the status on screen: a category whose only course is Done (or deleted) is not offered.
  const inStatus = data.courses.filter((c) => statusOf(c) === statusPick);
  const categories = courseCategories(inStatus);
  const uncategorised = inStatus.some((c) => !(c.category ?? "").trim());
  const category = categoryPick === "all" || (categoryPick === "none" && categories.length && uncategorised) || categories.some((c) => c.key === categoryPick) ? categoryPick : "all";
  const visibleCourses = inStatus.filter((c) => category === "all" || (category === "none" ? !(c.category ?? "").trim() : categoryKey(c.category) === category));
  return (
    <>
      <PageHeader title="Learning" description="Plan your study week and watch the hours add up.">
      </PageHeader>
      <LearningToolbar
        current="courses"
        filter={
          data.courses.length > 0 && (
            <>
            {categories.length > 0 && (
              <Segmented
                label="Category"
                value={category}
                onChange={setCategoryPick}
                options={[{ value: "all", label: "All" }, ...categories.map((c) => ({ value: c.key, label: c.label })), ...(uncategorised ? [{ value: "none", label: "Other" }] : [])]}
              />
            )}
            <Segmented
              label="Status"
              value={statusPick}
              onChange={(next) => setStatusPick(next as CourseStatus)}
              options={COURSE_STATUSES.map((x) => ({ value: x.value, label: `${x.label} (${data.courses.filter((c) => statusOf(c) === x.value).length})` }))}
            />
            </>
          )
        }
        actions={
          <>
            <button type="button" className="btn btn-primary" onClick={() => setNewCourse("blank")} aria-label="Add a course">
              <Plus className="size-4" />
              Add
            </button>
          </>
        }
      />

      <section className="mt-5" aria-labelledby="courses-title">
        <h2 id="courses-title" className="sr-only">My courses</h2>
        {visibleCourses.length ? (
          <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {visibleCourses.map((course) => {
              const color = colorOf(course.color);
              const tone = course.days_left < 0 ? "bg-rose-50 text-rose-700" : course.days_left <= 7 ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600";
              return (
                <li key={course.id} className="card transition hover:shadow-md">
                  <Link href={`/learning/${course.id}`} className="block h-full rounded-2xl p-5 focus-visible:outline-2 focus-visible:outline-blue-400">
                    <span className="flex items-start gap-3">
                      <span className={`icon-tile size-10 shrink-0 ${color.tile}`}>
                        <GraduationCap className="size-5" aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-base font-semibold text-slate-900" title={course.title}>{course.title}</span>
                        <span className="block truncate text-sm text-slate-500">{[(course.category ?? "").trim(), remainingText(course) || (course.unit_count === 0 ? "No units yet" : `${plural(course.unit_count, "unit")} · ${plural(course.topic_count, "topic")}`)].filter(Boolean).join(" · ")}</span>
                      </span>
                    </span>
                    <span className="mt-3 flex flex-wrap items-center gap-1.5">
                      <span className={`badge ${tone}`}>{courseTimeBadge(course.days_left)}</span>
                      {course.state === "behind" && (
                        <span className="badge max-w-full bg-amber-50 text-amber-700">
                          <span className="truncate">Behind: {hm(course.behind_hours)} to catch up{course.weeks_behind > 0 ? ` (${plural(course.weeks_behind, "week")} late)` : ""}</span>
                        </span>
                      )}
                    </span>
                    <span className="mt-3 block truncate text-sm text-slate-600">
                      {course.forecast && course.state !== "done" ? forecastText(course.forecast) : `Due ${formatDate(course.target_date, "date")}`}
                    </span>
                    <span className="mt-4 block">
                      <span className="flex items-center gap-3">
                        <Progress value={course.percent} fill={color.bar} track="bg-slate-100" className="h-1.5 flex-1" />
                        <span className="text-xs font-semibold text-slate-600">{course.percent}%</span>
                      </span>
                      <span className="mt-1.5 block text-xs text-slate-500">
                        {(course.time_seconds ?? 0) > 0 ? `${spent(course.time_seconds ?? 0)} studied` : "No time counted yet"}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
            {data.courses.length ? `No ${statusPick} courses${category === "all" ? "" : " in this category"}.` : "Track a course unit by unit. Add one with “Add”."}
          </p>
        )}
      </section>

      {data.blocks.length > 0 && (
        <details className="card mt-5 p-5">
          <summary className="cursor-pointer text-sm font-semibold text-slate-800">
            Study sessions this week ({data.blocks.length}) · {hm(done)} done of {hm(planned)} planned
          </summary>
          <ul className="mt-3 space-y-2">
            {data.blocks.map((block) => (
              <li key={block.id} className="group flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3">
                <input type="checkbox" className="checkbox checkbox-green checkbox-lg mt-0.5 shrink-0" checked={block.done} onChange={() => toggle(block)} aria-label={`Done: ${DAYS[block.weekday]}, ${block.activity}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">
                    {DAYS[block.weekday]} · {num(block.hours)}h
                    <span className={`badge ml-2 align-middle text-xs font-semibold ${block.done ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100" : "bg-slate-100 text-slate-600"}`}>{block.done ? "Completed" : "Pending"}</span>
                  </p>
                  <p className="mt-0.5 text-sm text-slate-700">{block.activity}</p>
                </div>
                <button type="button" className="btn btn-ghost btn-sm btn-icon reveal shrink-0" onClick={() => remove(block)} aria-label="Remove block">
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <Modal open={newCourse !== null} onClose={() => setNewCourse(null)} title="New course" description="Then add its units and topics on the course page.">
        <CourseForm today={data.today} start={newCourse ?? "blank"} onClose={() => setNewCourse(null)} />
      </Modal>
    </>
  );
}

export function CourseForm({ today, onClose, course, start: startAt = "blank" }: { today: string; onClose: () => void; start?: NewCourseStart; course?: { id: string; title: string; subtitle: string; quote: string; start_date: string; target_date: string; category?: string; status?: CourseStatus } }) {
  const { toast } = useFeedback();
  const router = useRouter();
  const { profile } = useProfile();
  const weeklyGoal = Number(profile?.weekly_study_goal ?? 5);
  const [busy, setBusy] = useState(false);
  // New course only: a template (or a pasted outline) fills the title, the dates and the units and topics.
  const DEFAULT_SUBTITLE = "Personal Learning Progress Tracker";
  const [title, setTitle] = useState(course?.title ?? "");
  const [subtitle, setSubtitle] = useState(course?.subtitle ?? DEFAULT_SUBTITLE);
  // Words you typed yourself are kept when another template is picked; the ones a template filled in are replaced.
  const [titleTyped, setTitleTyped] = useState(false);
  const [subtitleTyped, setSubtitleTyped] = useState(false);
  // The category groups courses ("Digital Marketing" over "Google Ads" and "Meta Ads"): any words, and the ones already in use are suggested.
  const [category, setCategory] = useState(course?.category ?? "");
  const [categoryTyped, setCategoryTyped] = useState(false);
  const [status, setStatus] = useState<CourseStatus>(course?.status ?? "active");
  const { data: allCourses } = useSWR<{ items: CourseSummary[] }>("/courses");
  const knownCategories = courseCategories(allCourses?.items ?? []);
  const [start, setStart] = useState(course?.start_date ?? today);
  const [target, setTarget] = useState(course?.target_date ?? addDays(today, 112));
  const [targetTouched, setTargetTouched] = useState(false);
  const [templateKey, setTemplateKey] = useState("");
  const [outline, setOutline] = useState("");
  // The cursor starts where the button that opened the dialog points (it waits a tick: the dialog is shown after this form is drawn).
  useEffect(() => {
    if (course) return;
    const id = startAt === "ideas" ? "course-template" : startAt === "list" ? "course-outline" : "course-title";
    const tick = setTimeout(() => document.getElementById(id)?.focus(), 0);
    return () => clearTimeout(tick);
  }, [course, startAt]);
  const template = COURSE_TEMPLATES.find((t) => t.key === templateKey);
  const parsed = useMemo(() => parseOutline(outline), [outline]);
  const weeks = useMemo(() => (outline.trim() && parsed.topicCount ? templateWeeks({ outline, weeklyHours: weeklyGoal }, weeklyGoal, parsed) : 0), [outline, parsed, weeklyGoal]);
  // The target date follows the outline (weeks at your weekly goal, counted from this week when the start date is in the past,
  // because that is where the weeks are planned from) until you choose a date yourself.
  const suggested = weeks ? addDays(mondayOf(start > today ? start : today), weeks * 7 - 1) : null;
  const shownTarget = !course && suggested && !targetTouched ? suggested : target;

  const chooseTemplate = (key: string) => {
    setTemplateKey(key);
    const t = COURSE_TEMPLATES.find((x) => x.key === key);
    setOutline(t ? t.outline : "");
    if (!titleTyped) setTitle(t ? t.title : "");
    if (!subtitleTyped) setSubtitle(t ? t.subtitle : DEFAULT_SUBTITLE);
    if (!categoryTyped) setCategory(t ? t.subject : "");
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
      category: category.trim().replace(/\s+/g, " "),
      ...(course ? { status } : {}),
    };
    setBusy(true);
    try {
      const saved = await api<{ id: string }>(course ? `/courses/${course.id}` : "/courses", { method: course ? "PATCH" : "POST", body });
      if (!course && outline.trim() && (parsed.topicCount || parsed.units.length)) {
        try {
          const added = await api<{ plan: { overflow: number } | null; plan_error: string | null }>(`/courses/${saved.id}/outline`, { method: "POST", body: { text: outline.slice(0, OUTLINE_LIMITS.text), plan: true, weekly_hours: weeklyGoal } });
          if (added.plan_error) toast(`The outline was added, but the weeks could not be planned: ${added.plan_error}`, "error");
          else if (added.plan && added.plan.overflow > 0) toast(`${hm(added.plan.overflow)} do not fit before the target date. Raise the weekly hours or move the target date.`, "error");
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
        <input id="course-title" name="title" className="input" required maxLength={300} value={title} onChange={(e) => { setTitle(e.target.value); setTitleTyped(e.target.value.trim() !== ""); }} placeholder="e.g. Level 4 Award in IQA" autoComplete="off" autoFocus />
      </Field>
      <Field label="Subtitle" htmlFor="course-subtitle">
        <input id="course-subtitle" name="subtitle" className="input" maxLength={120} value={subtitle} onChange={(e) => { setSubtitle(e.target.value); setSubtitleTyped(e.target.value.trim() !== ""); }} />
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
      <Field label="Category (optional)" htmlFor="course-category" hint="Groups your courses: “Digital Marketing” over “Google Ads” and “Meta Ads”. Pick one you already use or type a new one.">
        <input
          id="course-category"
          className="input"
          maxLength={60}
          list="course-categories"
          value={category}
          onChange={(e) => { setCategory(e.target.value); setCategoryTyped(e.target.value.trim() !== ""); }}
          placeholder="e.g. Digital Marketing"
          autoComplete="off"
        />
        <datalist id="course-categories">
          {knownCategories.map((c) => (
            <option key={c.key} value={c.label} />
          ))}
        </datalist>
      </Field>
      {course && (
        <Field label="Status" htmlFor="course-status" hint="A course is marked done by itself when all its topics are done. Paused and finished courses are left out of “Study next” and the reminders.">
          <select id="course-status" className="select select-lg" value={status} onChange={(e) => setStatus(e.target.value as CourseStatus)}>
            {COURSE_STATUSES.map((x) => (
              <option key={x.value} value={x.value}>{x.label}</option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Motto (optional)" htmlFor="course-quote">
        <input id="course-quote" name="quote" className="input" maxLength={200} defaultValue={course?.quote} placeholder="Plan your learning. Track your progress. Achieve your goal." />
      </Field>
      {!course && (
        <details className="rounded-2xl border border-slate-200 p-3" open={Boolean(outline) || startAt === "list"}>
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
          {outline.trim() && (
            <p className="mt-1 text-xs font-medium text-slate-700" aria-live="polite">
              {parsed.units.length || parsed.topicCount ? `${plural(parsed.units.length, "unit")} · ${plural(parsed.topicCount, "topic")} · ${hm(parsed.hours)}` : "Nothing read yet."}
            </p>
          )}
          {parsed.warnings.map((w) => (
            <p key={w} className="mt-1 text-xs text-amber-700">{w}</p>
          ))}
        </details>
      )}
      <ModalActions onCancel={onClose} submitLabel={course ? "Save course" : "Create course"} busy={busy} />
    </form>
  );
}
