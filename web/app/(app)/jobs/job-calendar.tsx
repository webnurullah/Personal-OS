"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addMonths, formatDate, monthGrid, weekdayNames } from "@/lib/dates";
import type { JobApplication, JobStatus } from "@/lib/types";

const CHIP: Record<JobStatus, string> = {
  saved: "bg-amber-50 text-amber-800 ring-amber-200",
  applied: "bg-blue-50 text-blue-700 ring-blue-200",
  interview: "bg-violet-50 text-violet-700 ring-violet-200",
  offer: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  rejected: "bg-rose-50 text-rose-700 ring-rose-200",
};

/**
 * A month of last days to apply: each job sits on the day it closes (saved ones stand out; the ones you already applied for are lighter).
 * Tap a job to open it. Jobs with no last date are listed under the month.
 */
export function JobCalendar({ jobs, today, weekStart, onOpen }: { jobs: JobApplication[]; today: string; weekStart: number; onOpen: (job: JobApplication) => void }) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const grid = monthGrid(month, weekStart);
  const byDay = new Map<string, JobApplication[]>();
  for (const job of jobs) if (job.deadline) byDay.set(job.deadline, [...(byDay.get(job.deadline) ?? []), job]);
  const noDate = jobs.filter((j) => !j.deadline);
  const inMonth = jobs.filter((j) => j.deadline?.startsWith(month)).length;

  return (
    <section className="card p-3 sm:p-4" aria-label="Last days to apply">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-3">
        <h2 className="text-base font-semibold text-slate-900">{formatDate(`${month}-01`, "month")}</h2>
        <div className="flex items-center gap-1.5">
          <span className="mr-1 text-xs text-slate-500">{inMonth} {inMonth === 1 ? "job closes" : "jobs close"} this month</span>
          <button type="button" className="btn btn-secondary btn-sm btn-icon" aria-label="Previous month" onClick={() => setMonth((m) => addMonths(m, -1))}><ChevronLeft className="size-4" /></button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMonth(today.slice(0, 7))}>Today</button>
          <button type="button" className="btn btn-secondary btn-sm btn-icon" aria-label="Next month" onClick={() => setMonth((m) => addMonths(m, 1))}><ChevronRight className="size-4" /></button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[34rem]">
          <div className="grid grid-cols-7 gap-px text-center text-xs font-medium text-slate-500">
            {weekdayNames(weekStart).map((d) => (
              <div key={d} className="py-1.5">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl bg-slate-200 ring-1 ring-slate-200">
            {grid.map((day) => {
              const list = byDay.get(day) ?? [];
              const inThisMonth = day.startsWith(month);
              return (
                <div key={day} className={`min-h-20 min-w-0 p-1 ${inThisMonth ? "bg-white" : "bg-slate-50"}`}>
                  <p className={`mb-1 text-right text-[11px] ${day === today ? "inline-grid size-5 place-items-center rounded-full bg-blue-600 font-semibold text-white" : inThisMonth ? "text-slate-600" : "text-slate-300"} ${day === today ? "float-right" : ""}`}>{Number(day.slice(8))}</p>
                  <ul className="clear-both space-y-0.5">
                    {list.slice(0, 3).map((job) => (
                      <li key={job.id}>
                        <button type="button" onClick={() => onOpen(job)} title={`${job.title} · ${job.company}`} className={`block w-full truncate rounded-md px-1 py-0.5 text-left text-[11px] leading-snug ring-1 ${CHIP[job.status]} ${job.status === "saved" ? "font-semibold" : "opacity-80"}`}>
                          {job.title}
                        </button>
                      </li>
                    ))}
                    {list.length > 3 && <li className="px-1 text-[11px] text-slate-500">+{list.length - 3} more</li>}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {noDate.length > 0 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer px-1 font-medium text-slate-600">No last date ({noDate.length})</summary>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {noDate.map((job) => (
              <li key={job.id}>
                <button type="button" onClick={() => onOpen(job)} className={`max-w-64 truncate rounded-md px-2 py-1 text-xs ring-1 ${CHIP[job.status]}`}>{job.title}</button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
