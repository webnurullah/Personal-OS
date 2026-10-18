"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Timer } from "lucide-react";
import { colorOf } from "@/lib/colors";
import { formatDate } from "@/lib/dates";
import { clock, MAX_SESSION_SECONDS, spent, type ProjectTimeSummary } from "@/lib/project-time";
import { useSecond } from "@/lib/use-second";
import { Skeleton } from "@/components/ui/states";

/** Habits → "Project time": how long you worked on each project and course, each of the last 7 days (kept by the timer on the project and course pages). */
export function ProjectTimeCard({ className = "" }: { className?: string }) {
  const [skew, setSkew] = useState(0);
  const { data, error } = useSWR<ProjectTimeSummary>("/project-time?days=7", { onSuccess: (d) => setSkew(new Date(d.now).getTime() - Date.now()) });
  const second = useSecond(Boolean(data?.running));

  if (!data) {
    return (
      <section className={`card p-5 ${className}`} aria-labelledby="project-time-title">
        <h2 id="project-time-title" className="card-title">Project &amp; course time</h2>
        {error ? <p className="mt-3 text-sm text-slate-500">The project time could not be loaded.</p> : <Skeleton className="mt-4 h-24" />}
      </section>
    );
  }

  const running = data.running;
  const sinceStart = running ? Math.min(MAX_SESSION_SECONDS, Math.max(0, Math.floor((second + skew - new Date(running.started_at).getTime()) / 1000))) : 0;
  const lines = data.projects ?? [];
  const highest = Math.max(1, ...lines.flatMap((p) => p.by_day));

  return (
    <section className={`card p-5 ${className}`} aria-labelledby="project-time-title">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="icon-tile size-10 shrink-0 bg-indigo-50 text-indigo-600">
            <Timer className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 id="project-time-title" className="card-title">Project &amp; course time</h2>
            <p className="text-xs text-slate-500">How long you worked on each project and course, last 7 days. Start the timer on a project or course page.</p>
          </div>
        </div>
        <dl className="flex shrink-0 gap-4 text-right">
          <div>
            <dt className="text-[11px] font-medium text-slate-500">Today</dt>
            <dd className="text-lg font-bold tabular-nums text-slate-900">{spent(data.today_seconds ?? 0)}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium text-slate-500">This week</dt>
            <dd className="text-lg font-bold tabular-nums text-slate-900">{spent(data.week_seconds ?? 0)}</dd>
          </div>
        </dl>
      </header>

      {running && (
        <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
          <span className="size-2 shrink-0 animate-pulse rounded-full bg-emerald-500" aria-hidden />
          <span className="min-w-0 break-words">Timer running on <b className="font-semibold">{running.name}</b></span>
          <span className="font-semibold tabular-nums" role="timer" aria-label="This session">{clock(sinceStart)}</span>
          <Link href={`${running.kind === "course" ? "/learning" : "/projects"}/${running.project_id}`} className="font-semibold underline">Open</Link>
        </p>
      )}

      {lines.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">No time kept yet. Open a project or a course and press Start.</p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100">
          {lines.map((p) => {
            const color = colorOf(p.color);
            return (
              <li key={p.id} className="py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <Link href={`${p.kind === "course" ? "/learning" : "/projects"}/${p.id}`} className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-800 hover:text-blue-600">
                    <span className={`size-2.5 shrink-0 rounded-full ${color.dot}`} aria-hidden />
                    <span className="min-w-0 truncate" title={p.name}>{p.name}</span>
                    {p.kind === "course" && <span className="badge shrink-0 bg-slate-100 text-slate-600">Course</span>}
                  </Link>
                  <span className="shrink-0 whitespace-nowrap text-xs text-slate-500">
                    <b className="font-semibold tabular-nums text-slate-700">{spent(p.week_seconds)}</b> this week · {spent(p.total_seconds)} in all
                  </span>
                </div>
                <ol className="mt-2 grid grid-cols-7 gap-1.5" aria-label={`${p.name}: time each day`}>
                  {(data.days ?? []).map((day, i) => {
                    const seconds = p.by_day[i];
                    return (
                      <li key={day} className="min-w-0 text-center" aria-label={`${formatDate(day, "long")}: ${spent(seconds)}`}>
                        <span className="flex h-10 items-end justify-center rounded-md bg-slate-50">
                          {seconds > 0 && <span className={`w-full rounded-md ${color.bar}`} style={{ height: `${Math.max(12, Math.round((seconds / highest) * 100))}%` }} />}
                        </span>
                        <span className="mt-1 block truncate text-[10px] font-medium text-slate-600">{seconds > 0 ? spent(seconds) : "–"}</span>
                        <span className={`block text-[10px] ${day === data.today ? "font-bold text-blue-600" : "text-slate-400"}`}>{formatDate(day, "weekday")}</span>
                      </li>
                    );
                  })}
                </ol>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
