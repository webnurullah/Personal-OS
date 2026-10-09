"use client";

import { useMemo, useState, type FormEvent } from "react";
import { api, errorMessage, refresh } from "@/lib/api";
import { COURSE_TEMPLATES } from "@/lib/course-templates";
import { hm, num, plural } from "@/lib/format";
import { OUTLINE_LIMITS, parseOutline } from "@/lib/outline";
import { neededPace, planningWeek, type PlanTopic } from "@/lib/plan";
import { hoursLeft } from "@/lib/study";
import type { Course, Topic } from "@/lib/types";
import { Field } from "@/components/ui/controls";
import { useFeedback } from "@/components/ui/feedback";
import { ModalActions } from "@/components/ui/modal";

type PlanResult = { changed: number; firstWeek: number; lastWeek: number; overflow: number; weeks: number };

/** What a plan did, in words (and a warning when some hours do not fit before the target date). */
function planToasts(plan: PlanResult) {
  const done = plan.changed ? `Planned ${plural(plan.changed, "topic")} for weeks ${plan.firstWeek}–${plan.lastWeek}.` : "Nothing needed a new week.";
  return { done, warn: plan.overflow > 0 ? `${hm(plan.overflow)} do not fit before the target date. Raise the weekly hours or move the target date.` : null };
}

/** Paste an outline: units on their own lines, topics under them with "-" and their hours at the end. */
export function OutlineDialog({ course, hasPlan, weeklyGoal, onClose, onDone }: { course: Pick<Course, "id" | "title">; hasPlan: boolean; weeklyGoal: number; onClose: () => void; onDone: () => void }) {
  const { toast } = useFeedback();
  const [text, setText] = useState("");
  const [plan, setPlan] = useState(!hasPlan); // a course that already has a plan keeps it unless you say so
  const [busy, setBusy] = useState(false);
  const parsed = useMemo(() => parseOutline(text), [text]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const added = await api<{ units: number; topics: number; hours: number; warnings: string[]; plan: PlanResult | null; plan_error: string | null }>(`/courses/${course.id}/outline`, { method: "POST", body: { text: text.slice(0, OUTLINE_LIMITS.text), plan, weekly_hours: weeklyGoal } });
      await refresh("/learning", "/courses");
      toast(`Added ${plural(added.units, "unit")} and ${plural(added.topics, "topic")} (${hm(added.hours)}).`);
      if (added.plan_error) toast(`The weeks could not be planned: ${added.plan_error}. You can plan them with “Plan weeks”.`, "error");
      else if (added.plan) {
        const said = planToasts(added.plan);
        toast(said.warn ?? said.done, said.warn ? "error" : undefined);
      }
      onDone();
      onClose();
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Outline" htmlFor="outline-text" hint="One unit per line, its topics under it starting with “-”. Add the hours at the end of a topic (2h, 1.5h, 90m); without them a topic is 2h.">
        <textarea
          id="outline-text"
          className="input min-h-48 font-mono text-sm"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"Unit 1: SEO basics\n- What is SEO | 1h\n- Keyword research | 2.5h\nUnit 2: Paid ads\n- Google Ads | 3h"}
          spellCheck={false}
          autoFocus
        />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="outline-template" className="text-sm text-slate-600">Or start from</label>
        <select
          id="outline-template"
          className="select h-9 w-auto max-w-full text-sm"
          value=""
          onChange={(e) => {
            const t = COURSE_TEMPLATES.find((x) => x.key === e.target.value);
            if (t) setText(t.outline);
          }}
        >
          <option value="">a template…</option>
          {COURSE_TEMPLATES.map((t) => (
            <option key={t.key} value={t.key}>{t.title}</option>
          ))}
        </select>
      </div>
      <p className={`text-sm ${parsed.topicCount ? "text-slate-700" : "text-slate-400"}`} aria-live="polite">
        {parsed.topicCount || parsed.units.length
          ? `${plural(parsed.units.length, "unit")} · ${plural(parsed.topicCount, "topic")} · ${hm(parsed.hours)}`
          : "Nothing read yet."}
      </p>
      {parsed.warnings.map((w) => (
        <p key={w} className="text-xs text-amber-700">{w}</p>
      ))}
      <label className="flex items-start gap-3 text-sm text-slate-700">
        <input type="checkbox" className="checkbox checkbox-green mt-0.5" checked={plan} onChange={(e) => setPlan(e.target.checked)} />
        <span>
          Also plan the weeks
          <span className="block text-xs text-slate-500">Spreads every unfinished topic over the weeks left, {num(Math.min(80, weeklyGoal))}h a week (your weekly goal).{hasPlan ? " This replaces the weeks you set before." : ""}</span>
        </span>
      </label>
      <ModalActions onCancel={onClose} submitLabel="Add to the course" busy={busy} disabled={!parsed.topicCount && !parsed.units.length} />
    </form>
  );
}

/** Plan the weeks: spread what is left over your weekly hours, or only move the late topics to this week. */
export function PlanDialog({ course, topics, today, weeklyGoal, onClose, onDone }: { course: Pick<Course, "id" | "start_date" | "target_date">; topics: Topic[]; today: string; weeklyGoal: number; onClose: () => void; onDone: () => void }) {
  const { toast } = useFeedback();
  const [hours, setHours] = useState(String(Math.min(80, weeklyGoal))); // a week of the plan holds at most 80 hours
  const [busy, setBusy] = useState<"plan" | "carry" | null>(null);
  const planTopics: PlanTopic[] = topics.map((t) => ({ id: t.id, code: t.code, status: t.status, est_hours: Number(t.est_hours), actual_hours: Number(t.actual_hours), planned_week: t.planned_week, unit_position: 0, position: t.position }));
  const pace = neededPace(course, planTopics, today);
  const week = planningWeek(course, today);
  const late = topics.filter((t) => t.status !== "done" && t.planned_week != null && t.planned_week < week && hoursLeft(t) > 0).length;
  const weekly = Number(hours);

  const run = async (mode: "plan" | "carry") => {
    setBusy(mode);
    try {
      const result = await api<PlanResult>(`/courses/${course.id}/plan`, { method: "POST", body: { mode, ...(mode === "plan" ? { weekly_hours: weekly } : {}) } });
      await refresh("/learning", "/courses");
      const said = planToasts(result);
      toast(mode === "carry" ? (result.changed ? `Moved ${plural(result.changed, "late topic")} to this week.` : "No late topics to move.") : said.done);
      if (mode === "plan" && said.warn) toast(said.warn, "error");
      onDone();
      onClose();
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <p className="rounded-2xl bg-slate-50 p-3 text-sm text-slate-700 ring-1 ring-slate-100">
        {pace.left > 0
          ? `${hm(pace.left)} left to study and ${plural(pace.weeksLeft, "week")} to the target date: about ${hm(pace.perWeek)} a week finishes on time.`
          : "Everything is studied. Nothing is left to plan."}
      </p>
      <Field label="Hours you can study a week" htmlFor="plan-hours" hint="The topics are placed in course order, filling each week up to this many hours.">
        <input id="plan-hours" type="number" min={0.5} max={80} step={0.5} className="input" value={hours} onChange={(e) => setHours(e.target.value)} />
      </Field>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button type="button" className="btn btn-primary" disabled={busy !== null || pace.left <= 0 || !(weekly >= 0.5 && weekly <= 80)} onClick={() => run("plan")}>
          {busy === "plan" ? "Planning…" : "Plan the rest of the course"}
        </button>
        <button type="button" className="btn btn-secondary" disabled={busy !== null || late === 0} onClick={() => run("carry")} title="Moves topics planned for earlier weeks and not finished to this week">
          {busy === "carry" ? "Moving…" : late ? `Carry over ${plural(late, "late topic")}` : "No late topics"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
      </div>
      <p className="text-xs text-slate-500">Planning starts from this week (week {week}). Finished topics and past weeks are not changed; you can still change any week by hand afterwards.</p>
    </div>
  );
}
