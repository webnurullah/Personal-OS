"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Database, Sprout } from "lucide-react";
import { api, errorMessage, refreshAll } from "@/lib/api";
import { formatDate } from "@/lib/dates";
import { firstName, greeting } from "@/lib/format";
import type { Dashboard } from "@/lib/types";
import { useFeedback } from "../ui/feedback";
import { LoadError, PageSkeleton } from "../ui/states";
import { BudgetWidget, GoalsWidget, HabitsWidget, HealthWidget, LearningWidget, ProductivityWidget, RemindersWidget, ScheduleWidget, TasksWidget } from "./widgets";

export function DashboardView() {
  const { data, error, mutate } = useSWR<Dashboard>("/dashboard");
  if (error && !data) return <LoadError error={error} retry={() => mutate()} />;
  if (!data) return <PageSkeleton />;

  const isEmpty = !data.schedule.length && !data.tasks.today.length && !data.tasks.week.length && !data.habits.items.length && !data.goals.length && !data.reminders.length && !data.budget.spent;
  const name = firstName(data.name);

  return (
    <>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            {greeting()}
            {name ? `, ${name}` : ""}!
          </h1>
          <p className="mt-1 text-slate-500">Here&apos;s your overview for today. Small steps make a big life.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:gap-5">
          <span className="text-sm font-semibold text-slate-700">{formatDate(data.today, "full")}</span>
          <figure className="flex items-center gap-3 rounded-2xl bg-emerald-50 px-5 py-3 ring-1 ring-emerald-100">
            <Sprout className="size-7 shrink-0 text-emerald-600" />
            <div>
              <blockquote className="text-sm font-medium text-slate-800">Progress, not perfection.</blockquote>
              <figcaption className="text-xs text-slate-500">— Unknown</figcaption>
            </div>
          </figure>
        </div>
      </div>

      {isEmpty && <Welcome />}

      {/* Tasks, learning and notes first; then everything else. */}
      <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        <TasksWidget data={data} />
        <LearningWidget />
        <RemindersWidget data={data} />
        <ScheduleWidget data={data} />
        <HabitsWidget data={data} />
        <GoalsWidget data={data} />
        <BudgetWidget data={data} />
        <HealthWidget data={data} />
        <ProductivityWidget data={data} />
      </div>
    </>
  );
}

function Welcome() {
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);
  const load = async () => {
    setBusy(true);
    try {
      await api("/data/sample-data", { method: "POST" });
      await refreshAll();
      toast("Sample data added. Have a look around!");
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-6 flex flex-col gap-4 rounded-2xl bg-linear-to-br from-blue-600 to-indigo-600 p-6 text-white shadow-lg shadow-blue-600/20 sm:flex-row sm:items-center">
      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/15">
        <Database className="size-6" />
      </span>
      <div className="flex-1">
        <p className="text-lg font-semibold">Welcome! Your account is empty.</p>
        <p className="text-sm text-blue-100">Load the sample data to see how everything works (you can delete it later in Settings), or start adding your own.</p>
      </div>
      <div className="flex gap-2">
        <button type="button" className="btn bg-white text-blue-700 hover:bg-blue-50" onClick={load} disabled={busy}>
          {busy ? "Loading…" : "Load sample data"}
        </button>
        <Link href="/tasks?new=1" className="btn border border-white/40 text-white hover:bg-white/10">
          Add a task
        </Link>
      </div>
    </div>
  );
}
