"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Check, Database, Flame, Heart, Sprout, Target } from "lucide-react";
import { api, errorMessage, refreshAll } from "@/lib/api";
import { formatDate } from "@/lib/dates";
import { firstName, greeting, pct } from "@/lib/format";
import type { Dashboard } from "@/lib/types";
import { Progress } from "../ui/charts";
import { useFeedback } from "../ui/feedback";
import { LoadError, PageSkeleton } from "../ui/states";
import { BudgetWidget, GoalsWidget, HabitsWidget, HealthWidget, ProductivityWidget, RemindersWidget, ScheduleWidget, TasksWidget } from "./widgets";

export function DashboardView() {
  const { data, error, mutate } = useSWR<Dashboard>("/dashboard");
  if (error && !data) return <LoadError error={error} retry={() => mutate()} />;
  if (!data) return <PageSkeleton />;

  const { stats } = data;
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

      {/* Summary cards — every number is calculated by the API from your data. */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="flex items-center gap-4 rounded-2xl bg-[#eef3ff] p-5 ring-1 ring-blue-100">
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-blue-500 text-white shadow-md shadow-blue-500/25">
            <Check className="size-6" strokeWidth={3} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-600">Tasks Completed</p>
            <p className="mt-0.5 text-2xl font-bold text-slate-900">
              {stats.tasks.done} / {stats.tasks.total}
            </p>
            <div className="mt-2.5 flex items-center gap-3">
              <Progress value={pct(stats.tasks.done, stats.tasks.total)} fill="bg-blue-500" track="bg-blue-100" className="h-2 flex-1" />
              <span className="w-9 text-right text-xs font-semibold text-slate-600">{pct(stats.tasks.done, stats.tasks.total)}%</span>
            </div>
          </div>
        </article>

        <article className="flex items-center gap-4 rounded-2xl bg-[#ecfaf2] p-5 ring-1 ring-emerald-100" title="Goals you marked as on track">
          <span className="grid size-12 shrink-0 place-items-center text-emerald-600">
            <Target className="size-11" strokeWidth={2.25} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-600">Goals on Track</p>
            <p className="mt-0.5 text-2xl font-bold text-slate-900">
              {stats.goals.on_track} / {stats.goals.active}
            </p>
            <div className="mt-2.5 flex items-center gap-3">
              <Progress value={pct(stats.goals.on_track, stats.goals.active)} fill="bg-emerald-500" track="bg-emerald-100" className="h-2 flex-1" />
              <span className="w-9 text-right text-xs font-semibold text-slate-600">{pct(stats.goals.on_track, stats.goals.active)}%</span>
            </div>
          </div>
        </article>

        <article className="flex items-center gap-4 rounded-2xl bg-[#fff6e8] p-5 ring-1 ring-amber-100">
          <span className="grid size-12 shrink-0 place-items-center">
            <Flame className="size-11 fill-orange-300 text-orange-500" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-600">Best Habit Streak</p>
            <p className="mt-0.5 text-2xl font-bold text-slate-900">
              {stats.streak.days} {stats.streak.days === 1 ? "day" : "days"}
            </p>
            <p className="mt-1.5 truncate text-sm text-slate-600">{stats.streak.name ? <><span className="font-medium text-slate-700">{stats.streak.name}</span> · keep going!</> : "Tick a habit to start a streak"}</p>
          </div>
        </article>

        <Link href="/health" className="flex items-center gap-4 rounded-2xl bg-[#fdf0f4] p-5 ring-1 ring-pink-100 transition hover:ring-pink-200" title="Your own rating from today's health check-in">
          <span className="grid size-12 shrink-0 place-items-center">
            <Heart className="size-11 fill-pink-400 text-pink-500" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-600">Wellness Score</p>
            {stats.wellness ? (
              <>
                <p className="mt-0.5 text-2xl font-bold text-slate-900">{stats.wellness} / 10</p>
                <div className="mt-2.5 flex items-center gap-3">
                  <Progress value={stats.wellness * 10} fill="bg-pink-500" track="bg-pink-100" className="h-2 flex-1" />
                  <span className="w-9 text-right text-xs font-semibold text-slate-600">{stats.wellness * 10}%</span>
                </div>
              </>
            ) : (
              <>
                <p className="mt-0.5 text-2xl font-bold text-slate-900">— / 10</p>
                <p className="mt-1.5 text-sm text-pink-700">Rate how you feel today →</p>
              </>
            )}
          </div>
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,22.5rem)_minmax(0,1fr)]">
        <ScheduleWidget data={data} />
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 min-[100rem]:grid-cols-3">
          <TasksWidget data={data} />
          <HabitsWidget data={data} />
          <GoalsWidget data={data} />
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 min-[112.5rem]:grid-cols-4">
          <BudgetWidget data={data} />
          <HealthWidget data={data} />
          <RemindersWidget data={data} />
          <ProductivityWidget data={data} />
        </div>
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
