"use client";

import Link from "next/link";
import { Check, Flame, ListChecks, RotateCcw, Timer, Hourglass } from "lucide-react";
import { formatDate } from "@/lib/dates";
import { hm, num, plural } from "@/lib/format";
import { finishedText } from "@/lib/revision";
import { reasonText, type StudyReason } from "@/lib/study";
import type { LearningWeek, RevisionDue, StudyNextItem } from "@/lib/types";

const REASON_STYLE: Record<StudyReason, string> = {
  overdue: "bg-amber-50 text-amber-800 ring-1 ring-amber-100",
  "this-week": "bg-blue-50 text-blue-700 ring-1 ring-blue-100",
  "in-progress": "bg-violet-50 text-violet-700 ring-1 ring-violet-100",
  next: "bg-slate-100 text-slate-600",
};

/** The last 8 weeks as small bars (green once the weekly goal was reached). */
function WeekBars({ weeks, goal }: { weeks: LearningWeek["stats"]["weeks"]; goal: number }) {
  const top = Math.max(goal, ...weeks.map((w) => w.hours), 1);
  return (
    <div className="flex items-center gap-2 text-xs text-slate-500">
      <div className="flex h-8 items-end gap-1" role="img" aria-label={`Hours studied in each of the last 8 weeks, oldest first: ${weeks.map((w) => num(w.hours)).join(", ")}`}>
        {weeks.map((w) => (
          <span
            key={w.week_start}
            title={`Week of ${formatDate(w.week_start, "short")}: ${hm(w.hours)}`}
            className={`w-2.5 rounded-sm ${w.hours >= goal ? "bg-emerald-500" : w.hours > 0 ? "bg-emerald-300" : "bg-slate-200"}`}
            style={{ height: `${Math.max(14, Math.round((w.hours / top) * 100))}%` }}
          />
        ))}
      </div>
      <span className="whitespace-nowrap">last 8 weeks</span>
    </div>
  );
}

/** What to study today: the few topics that matter most, with one tap to log time or finish them. */
export function StudyNext({ data, onLog, onFinish, onFocus, onRevised }: { data: LearningWeek; onLog: (topicId: string) => void; onFinish: (item: StudyNextItem) => void; onFocus: (topicId: string) => void; onRevised: (item: RevisionDue) => void }) {
  if (!data.study_next || !data.stats) return null; // a copy saved before this existed: shown once the fresh answer arrives
  const revision = data.revision ?? [];
  if (!data.courses.length && !revision.length) return null; // the "My courses" card already says how to start
  const { stats, study_next: items } = data;
  const behind = data.courses.filter((c) => c.state === "behind").length;

  return (
    <section className="card mt-5 p-5" aria-labelledby="next-title">
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
        <div className="min-w-0">
          <h2 id="next-title" className="card-title flex items-center gap-2">
            <ListChecks className="size-5 text-indigo-600" aria-hidden /> Study next
          </h2>
          {behind > 0 && <p className="mt-0.5 text-xs font-medium text-amber-700">{plural(behind, "course")} behind the plan</p>}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {stats.streak > 0 && (
            <span className="badge shrink-0 whitespace-nowrap bg-orange-50 px-2.5 py-1 font-semibold text-orange-700 ring-1 ring-orange-100">
              <Flame className="size-4" aria-hidden /> {plural(stats.streak, "week")} in a row
            </span>
          )}
          <WeekBars weeks={stats.weeks} goal={Number(data.goal_hours)} />
        </div>
      </div>

      {items.length ? (
        <ul className="mt-4 space-y-2.5">
          {items.map((item) => (
            <li key={item.topic_id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-3.5 sm:flex-row sm:items-center sm:gap-4">
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 font-semibold leading-snug text-slate-900">
                  <span className="text-slate-500">{item.code}</span> {item.title}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                  <Link href={`/learning/${item.course_id}`} className="min-w-0 max-w-full truncate font-medium text-blue-700 hover:underline">{item.course_title}</Link>
                  <span className="whitespace-nowrap">{item.hours_left > 0 ? `${hm(item.hours_left)} left` : "all hours logged"}</span>
                  <span className={`badge shrink-0 whitespace-nowrap px-2 py-0.5 font-medium ${REASON_STYLE[item.reason]}`}>{reasonText({ reason: item.reason, weeksLate: item.weeks_late })}</span>
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button type="button" className="btn btn-primary btn-sm" onClick={() => onLog(item.topic_id)}>
                  <Timer className="size-4" /> Log time
                </button>
                <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => onFocus(item.topic_id)} aria-label={`Start a focus timer on ${item.code} ${item.title}`} title="Start a focus timer">
                  <Hourglass className="size-4" />
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => onFinish(item)} aria-label={`Mark ${item.code} ${item.title} finished`}>
                  <Check className="size-4" /> Done
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
          Nothing to study right now. Add topics to a course, or wait for your next course to start.
        </p>
      )}

      {revision.length > 0 && (
        <div className="mt-5 border-t border-slate-100 pt-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <RotateCcw className="size-4 text-violet-600" aria-hidden /> Time to revise
          </h3>
          <ul className="mt-3 space-y-2">
            {revision.map((r) => (
              <li key={`${r.kind}-${r.id}`} className="flex flex-col gap-2 rounded-2xl bg-violet-50/60 p-3 ring-1 ring-violet-100 sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1">
                  <Link href={r.href} className="line-clamp-2 text-sm font-medium text-slate-900 hover:underline">{r.title}</Link>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {r.label ? `${r.label} · ` : ""}{finishedText(r.daysSince)} · look {r.step + 1} of 3
                  </p>
                </div>
                <button type="button" className="btn btn-secondary btn-sm shrink-0 self-start sm:self-auto" onClick={() => onRevised(r)} aria-label={`Mark ${r.title} revised`}>
                  <Check className="size-4" /> Revised
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
