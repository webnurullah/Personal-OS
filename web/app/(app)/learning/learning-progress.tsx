"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ChartColumn } from "lucide-react";
import { hm, num, plural } from "@/lib/format";
import { paceDiff, type LearningProgress, type PeriodKind, type PeriodStats } from "@/lib/progress";
import { Progress } from "@/components/ui/charts";
import { Segmented } from "@/components/ui/controls";

type ProgressResponse = LearningProgress & { today: string; weekly_goal: number };

const KINDS: { value: PeriodKind; label: string; now: string; unit: string }[] = [
  { value: "week", label: "Weekly", now: "This week", unit: "weeks" },
  { value: "month", label: "Monthly", now: "This month", unit: "months" },
  { value: "quarter", label: "Quarterly", now: "This quarter", unit: "quarters" },
];

/** The hours of each period as bars, the goal as a tick on each; tap a bar to see that period below. */
function Bars({ series, selected, onPick, unit }: { series: PeriodStats[]; selected: string; onPick: (start: string) => void; unit: string }) {
  const top = Math.max(1, ...series.map((p) => Math.max(p.hours, p.goal)));
  return (
    <figure className="mt-5">
      <div className="flex items-end gap-2 sm:gap-3" role="group" aria-label={`Hours studied in each of the last ${series.length} ${unit}, oldest first. Tap one to see it.`}>
        {series.map((p) => {
          const reached = p.goal > 0 && p.hours >= p.goal;
          const isSelected = p.start === selected;
          return (
            <button
              key={p.start}
              type="button"
              onClick={() => onPick(p.start)}
              aria-pressed={isSelected}
              aria-label={`${p.label}: ${hm(p.hours)} of ${hm(p.goal)}`}
              title={`${p.label}: ${hm(p.hours)} of ${hm(p.goal)} goal`}
              className={`group flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-xl px-0.5 pb-1.5 pt-1 transition focus-visible:outline-2 focus-visible:outline-blue-400 ${isSelected ? "bg-indigo-50 ring-1 ring-indigo-100" : "hover:bg-slate-50"}`}
            >
              <span className="whitespace-nowrap text-[11px] font-semibold text-slate-600">{p.hours ? `${num(p.hours)}h` : "–"}</span>
              <span className="relative block h-28 w-full max-w-12">
                {/* the goal for this period */}
                <span className="absolute inset-x-0 border-t-2 border-dashed border-slate-300" style={{ bottom: `${(p.goal / top) * 100}%` }} aria-hidden />
                <span
                  className={`absolute inset-x-1 bottom-0 rounded-t-md ${reached ? "bg-emerald-500" : p.hours > 0 ? "bg-emerald-300" : "bg-slate-200"}`}
                  style={{ height: p.hours > 0 ? `${Math.max(4, (p.hours / top) * 100)}%` : "3px" }}
                  aria-hidden
                />
              </span>
              <span className={`whitespace-nowrap text-[11px] ${p.current ? "font-bold text-indigo-700" : "text-slate-500"}`}>{p.current ? "Now" : p.short}</span>
            </button>
          );
        })}
      </div>
      <figcaption className="mt-2 flex items-center gap-2 text-xs text-slate-500">
        <span className="w-5 border-t-2 border-dashed border-slate-300" aria-hidden /> your goal for the period
        <span className="ml-3 size-2.5 rounded-sm bg-emerald-500" aria-hidden /> reached
      </figcaption>
      <div className="sr-only">
        <table>
          <caption>Hours studied and the goal for each period</caption>
          <thead>
            <tr><th>Period</th><th>Studied</th><th>Goal</th></tr>
          </thead>
          <tbody>
            {series.map((p) => (
              <tr key={p.start}><td>{p.label}</td><td>{hm(p.hours)}</td><td>{hm(p.goal)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-100">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-0.5 truncate text-xl font-bold text-slate-900">{value}</p>
      {note && <p className="truncate text-xs text-slate-500">{note}</p>}
    </div>
  );
}

/** How the period is going: against the goal and, while it is running, against an even pace. */
function paceText(p: PeriodStats) {
  if (!p.current) return p.goal > 0 && p.hours >= p.goal ? "Goal reached." : p.goal > 0 ? `${hm(p.goal - p.hours)} short of the goal.` : "";
  const left = p.days - p.elapsed_days;
  const days = left <= 0 ? "last day" : `${plural(left, "day")} left`;
  if (p.goal > 0 && p.hours >= p.goal) return `Goal reached, ${days}.`;
  const diff = paceDiff(p);
  if (Math.abs(diff) < 0.25) return `On pace, ${days}.`;
  return diff > 0 ? `${hm(diff)} ahead of pace, ${days}.` : `${hm(-diff)} behind pace, ${days}.`;
}

function Detail({ p, now }: { p: PeriodStats; now: string }) {
  const total = p.shares.reduce((sum, s) => sum + s.hours, 0);
  const weeks = (p.current ? Math.max(1, p.elapsed_days) : p.days) / 7;
  return (
    <div className="mt-5 border-t border-slate-100 pt-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="text-base font-semibold text-slate-900">{p.label}</h3>
        {p.current && <span className="badge bg-indigo-50 text-indigo-700">{now}</span>}
      </div>
      <div className="mt-3 flex items-end justify-between gap-3 text-sm font-semibold">
        <p className="text-slate-800"><span className="text-lg">{hm(p.hours)}</span> studied</p>
        <p className="text-slate-500">goal {hm(p.goal)} · {p.percent}%</p>
      </div>
      <Progress value={p.percent} fill={p.percent >= 100 ? "bg-emerald-500" : "bg-emerald-400"} track="bg-slate-100" className="mt-2 h-3" />
      <p className="mt-2 text-sm text-slate-600">{paceText(p)}</p>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tile label="Study days" value={`${p.study_days} of ${p.current ? p.elapsed_days : p.days}`} />
        <Tile label="Sessions" value={String(p.sessions)} note={p.sessions ? `${hm(p.avg_session)} each` : undefined} />
        {p.kind === "week" ? (
          <Tile label="Per study day" value={p.study_days ? hm(p.hours / p.study_days) : "–"} />
        ) : (
          <Tile label="Weekly average" value={hm(p.hours / weeks)} note={`goal ${hm(p.goal / (p.days / 7))}`} />
        )}
        <Tile label="Topics finished" value={String(p.topics_done)} />
        <Tile label="Library items done" value={String(p.items_done)} />
        <Tile label="Courses studied" value={String(p.shares.filter((s) => s.course_id || s.key === "more").length)} />
      </div>

      <h4 className="mt-5 text-sm font-semibold text-slate-800">Where the time went</h4>
      {p.shares.length ? (
        <ul className="mt-2 space-y-2.5">
          {p.shares.map((s) => (
            <li key={s.key}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                {s.course_id ? (
                  <Link href={`/learning/${s.course_id}`} className="min-w-0 truncate font-medium text-slate-800 hover:underline" title={s.title}>{s.title}</Link>
                ) : (
                  <span className="min-w-0 truncate font-medium text-slate-700" title={s.title}>{s.title}</span>
                )}
                <span className="shrink-0 whitespace-nowrap text-slate-600">{hm(s.hours)} · {total ? Math.round((s.hours / total) * 100) : 0}%</span>
              </div>
              <Progress value={total ? (s.hours / total) * 100 : 0} fill="bg-indigo-400" track="bg-slate-100" className="mt-1 h-1.5" />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 rounded-xl border border-dashed border-slate-200 px-4 py-5 text-center text-sm text-slate-500">No study time was logged in this period.</p>
      )}
    </div>
  );
}

/** Learning progress and time by week, month and quarter. */
export function LearningProgressCard() {
  const { data } = useSWR<ProgressResponse>("/learning/progress");
  const [kind, setKind] = useState<PeriodKind>("week");
  const [picked, setPicked] = useState<string | null>(null); // the first day of the period you tapped; null = the current one
  const info = KINDS.find((k) => k.value === kind)!;

  return (
    <section className="card mt-5 p-5 sm:p-6" aria-labelledby="progress-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="progress-title" className="card-title flex items-center gap-2">
          <ChartColumn className="size-5 text-emerald-600" aria-hidden /> Learning progress and time
        </h2>
        <Segmented label="Period" value={kind} onChange={(next) => { setKind(next); setPicked(null); }} options={KINDS.map((k) => ({ value: k.value, label: k.label }))} />
      </div>
      {data?.week ? (
        (() => {
          const series = data[kind];
          const selected = series.find((p) => p.start === picked) ?? series[series.length - 1];
          return (
            <>
              <Bars series={series} selected={selected.start} onPick={setPicked} unit={info.unit} />
              <Detail p={selected} now={info.now} />
            </>
          );
        })()
      ) : (
        <div className="mt-5 h-64 animate-pulse rounded-2xl bg-slate-100" aria-hidden />
      )}
    </section>
  );
}
