"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowRight, BriefcaseBusiness, CalendarDays, ChartNoAxesColumn, ChartColumn, Clock, FileText, Footprints, GraduationCap, HeartPulse, Leaf, Moon, Pin, Plus, SquareCheck, Sun, Target, TrendingUp, Wallet } from "lucide-react";
import { api, errorMessage, refresh } from "@/lib/api";
import { colorOf } from "@/lib/colors";
import { daysBetween, formatDate } from "@/lib/dates";
import { count, hm, minutesOf, pct } from "@/lib/format";
import { useCategories, useNowMinutes } from "@/lib/hooks";
import { useProfile } from "@/lib/profile";
import { taskDateLabel } from "@/lib/tasks";
import { deadlineLabel, isOpen } from "@/lib/jobs";
import type { Dashboard, JobApplication, LearningWeek, List, Note, Task } from "@/lib/types";
import { Donut, Progress } from "../ui/charts";
import { Segmented } from "../ui/controls";
import { useFeedback } from "../ui/feedback";
import { Icon } from "../ui/icon";

type Props = { data: Dashboard };

function Widget({ icon, tile, title, link, children, className = "" }: { icon: ReactNode; tile: string; title: string; link?: { href: string; label: string }; children: ReactNode; className?: string }) {
  return (
    <section className={`card flex flex-col p-5 ${className}`}>
      <header className="flex items-center justify-between gap-3">
        <h2 className="card-title flex items-center gap-2.5">
          <span className={`icon-tile size-8 ${tile}`}>{icon}</span>
          {title}
        </h2>
        {link && (
          <Link href={link.href} className="link-more">
            {link.label} <ArrowRight className="size-3.5" />
          </Link>
        )}
      </header>
      {children}
    </section>
  );
}

/** Runs an API call, shows errors as a toast, then reloads the dashboard. */
function useAction() {
  const { toast } = useFeedback();
  return async (work: () => Promise<unknown>, ...prefixes: string[]) => {
    try {
      await work();
    } catch (error) {
      toast(errorMessage(error), "error");
    }
    await refresh(...prefixes);
  };
}

// ---------- Today's schedule ----------
export function ScheduleWidget({ data }: Props) {
  const { time } = useProfile();
  const { byId } = useCategories();
  const now = useNowMinutes();
  const timed = data.schedule.filter((e) => !e.all_day && e.start_time);
  const next = timed.find((e) => minutesOf(e.start_time!) > now);

  return (
    <section className="card flex flex-col p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="icon-tile shrink-0 bg-blue-50 text-blue-600">
            <CalendarDays className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="card-title">Today&apos;s Schedule</h2>
            <p className="text-xs text-slate-500">{formatDate(data.today, "full")}</p>
          </div>
        </div>
        <Link href="/calendar" className="link-more mt-1 shrink-0">
          View Calendar <ArrowRight className="size-3.5" />
        </Link>
      </header>

      {data.schedule.length ? (
        <ol className="mt-4 space-y-0.5">
          {data.schedule.map((e) => {
            const current = !e.all_day && e.start_time && e.end_time && now >= minutesOf(e.start_time) && now < minutesOf(e.end_time);
            const color = colorOf(e.category_id ? byId.get(e.category_id)?.color : "slate");
            return (
              <li key={`${e.id}-${e.date}`} className={`grid grid-cols-[4.25rem_auto_1fr] items-start gap-3 rounded-xl px-2 py-2 ${current ? "bg-blue-50 ring-1 ring-blue-100" : ""}`}>
                <time className="pt-0.5 text-xs font-medium text-slate-500">{e.all_day ? "All day" : time(e.start_time!)}</time>
                <span className={`mt-0.5 h-9 w-1 rounded-full ${color.dot}`} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">
                    {e.title}
                    {current && <span className="badge ml-1 bg-blue-600 px-1.5 py-0 text-[10px] text-white">Now</span>}
                  </p>
                  {e.note && <p className="truncate text-xs text-slate-500">{e.note}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="mt-6 rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">Nothing planned today.</p>
      )}

      <div className="mt-auto pt-4">
        <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
          <span className="icon-tile size-8 bg-white text-blue-600 ring-1 ring-slate-200">
            <Clock className="size-4" />
          </span>
          <p className="text-sm text-slate-600">
            {next ? (
              <>
                Next: <b className="font-semibold text-slate-800">{next.title}</b> at {time(next.start_time!)}{" "}
                <span className="text-slate-400">· in {hm((minutesOf(next.start_time!) - now) / 60)}</span>
              </>
            ) : (
              <>That&apos;s a wrap for today. <b className="font-semibold text-slate-800">Rest well.</b></>
            )}
          </p>
        </div>
      </div>
    </section>
  );
}

// ---------- Tasks ----------
export function TasksWidget({ data }: Props) {
  const [tab, setTab] = useState<"today" | "week" | "overdue">("today");
  const { byId } = useCategories();
  const act = useAction();
  const list: Task[] = data.tasks[tab];

  const toggle = (task: Task) => act(() => api(`/tasks/${task.id}`, { method: "PATCH", body: { done: !task.done_at } }), "/tasks");

  return (
    <Widget icon={<SquareCheck className="size-4.5" />} tile="bg-blue-50 text-blue-600" title="Tasks" link={{ href: "/tasks", label: "View All" }}>
      <div className="mt-4 self-start">
        <Segmented
          label="Which tasks"
          value={tab}
          onChange={setTab}
          options={[
            { value: "today", label: "Today" },
            { value: "week", label: "This Week" },
            { value: "overdue", label: <>Overdue {data.tasks.overdue.length > 0 && <span className="text-rose-500">({data.tasks.overdue.length})</span>}</> },
          ]}
        />
      </div>
      {list.length ? (
        <ul className="mt-2 divide-y divide-slate-100">
          {list.map((task) => {
            const category = task.category_id ? byId.get(task.category_id) : undefined;
            return (
              <li key={task.id} className="flex items-center gap-3 py-2.5">
                <input id={`dt-${task.id}`} type="checkbox" className="checkbox peer" checked={Boolean(task.done_at)} onChange={() => toggle(task)} />
                <label htmlFor={`dt-${task.id}`} className="min-w-0 flex-1 truncate text-sm text-slate-700 peer-checked:text-slate-400 peer-checked:line-through">
                  {task.title}
                </label>
                {(tab !== "today" || task.end_date) && task.due_date && <span className={`whitespace-nowrap text-xs ${tab === "overdue" ? "font-medium text-rose-500" : "text-slate-400"}`}>{taskDateLabel(task, data.today)}</span>}
                {category && <span className={`badge hidden max-w-40 truncate sm:inline-flex ${colorOf(category.color).badge}`}>{category.name}</span>}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-8 text-center text-sm text-slate-500">
          Nothing here. Nice work!{" "}
          <Link href="/tasks?new=1" className="font-medium text-blue-600">Add a task</Link>
        </p>
      )}
    </Widget>
  );
}

// ---------- Habits ----------
export function HabitsWidget({ data }: Props) {
  const act = useAction();
  const { days, items } = data.habits;
  const toggle = (habitId: string, date: string, done: boolean) => act(() => api(`/habits/${habitId}/logs/${date}`, { method: done ? "DELETE" : "PUT" }), "/habits");

  return (
    <Widget icon={<ChartColumn className="size-4.5" />} tile="bg-indigo-50 text-indigo-600" title="Habit Tracker" link={{ href: "/habits", label: "View All" }}>
      {items.length ? (
        <>
          <div className="mt-4 flex items-center gap-2.5 text-[11px] font-medium text-slate-400">
            <span className="flex-1">
              {data.habits.done_today} of {items.length} done today
            </span>
            <div className="flex gap-1">
              {days.map((d) => (
                <span key={d} className="w-4.5 text-center">{formatDate(d, "weekday").charAt(0)}</span>
              ))}
            </div>
            <span className="w-7" />
          </div>
          <ul className="mt-2 space-y-3">
            {items.map((habit) => (
              <li key={habit.id} className="flex items-center gap-2.5">
                <Icon name={habit.icon} className="size-4 shrink-0 text-slate-500" />
                <span className="min-w-0 flex-1 truncate text-[13px] text-slate-700">{habit.name}</span>
                <div className="flex gap-1">
                  {habit.done.map((done, i) => (
                    <button
                      key={days[i]}
                      type="button"
                      className={`habit-dot habit-dot-sm ${i === days.length - 1 ? "is-today" : ""}`}
                      aria-pressed={done}
                      title={`${habit.name} · ${i === days.length - 1 ? "Today" : formatDate(days[i], "long")}`}
                      onClick={() => toggle(habit.id, days[i], done)}
                    />
                  ))}
                </div>
                <span className="min-w-7 shrink-0 whitespace-nowrap text-right text-xs font-semibold text-slate-500">{habit.streak}d</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="py-8 text-center text-sm text-slate-500">
          No habits yet. <Link href="/habits?new=1" className="font-medium text-blue-600">Add your first</Link>
        </p>
      )}
    </Widget>
  );
}

// ---------- Goals ----------
export function GoalsWidget({ data }: Props) {
  return (
    <Widget icon={<Target className="size-4.5" />} tile="bg-emerald-50 text-emerald-600" title="Goals" link={{ href: "/goals", label: "View All" }}>
      {data.goals.length ? (
        <ul className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-x-8 min-[100rem]:grid-cols-1">
          {data.goals.map((goal) => {
            const color = colorOf(goal.color);
            return (
              <li key={goal.id} className="flex items-center gap-3">
                <span className={`icon-tile ${color.tile}`}>
                  <Icon name={goal.icon} className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
                    <span className="truncate">{goal.title}</span>
                    {goal.status === "behind" && <span className="size-1.5 shrink-0 rounded-full bg-amber-400" title="Behind schedule" />}
                  </p>
                  <div className="mt-1.5 flex items-center gap-3">
                    <Progress value={goal.percent} fill={color.bar} className="h-1.5 flex-1" />
                    <span className="min-w-8 shrink-0 whitespace-nowrap text-right text-xs font-semibold text-slate-600">{goal.percent}%</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-8 text-center text-sm text-slate-500">
          No goals yet. <Link href="/goals?new=1" className="font-medium text-blue-600">Set one</Link>
        </p>
      )}
    </Widget>
  );
}

// ---------- Monthly budget ----------
export function BudgetWidget({ data }: Props) {
  const { money } = useProfile();
  const { budget } = data;
  const left = budget.total - budget.spent;
  return (
    <Widget icon={<Wallet className="size-4.5" />} tile="bg-blue-50 text-blue-600" title="Monthly Budget" link={{ href: "/finance", label: formatDate(budget.month, "monthShort") }}>
      <div className="mt-4 flex items-center gap-4">
        <div className="relative size-32 shrink-0">
          <Donut className="absolute inset-0" thickness={17} max={Math.max(budget.total, budget.spent)} segments={budget.categories.map((c) => ({ value: c.spent, color: colorOf(c.color).hex }))} />
          <div className="absolute inset-0 grid place-content-center text-center">
            <p className="text-[15px] font-bold text-slate-900">{money(budget.spent)}</p>
            <p className="text-[11px] text-slate-500">of {money(budget.total)}</p>
          </div>
        </div>
        <ul className="min-w-0 flex-1 space-y-2 text-xs">
          {budget.categories.map((c) => (
            <li key={c.id} className="flex items-center gap-2">
              <span className={`size-2.5 shrink-0 rounded-full ${colorOf(c.color).dot}`} />
              <span className="flex-1 truncate text-slate-600">{c.name}</span>
              <b className="font-semibold text-slate-800">{pct(c.spent, budget.spent)}%</b>
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-auto pt-4">
        <div className={`flex items-center gap-3 rounded-xl p-3 ${left >= 0 ? "bg-emerald-50" : "bg-rose-50"}`}>
          <TrendingUp className={`size-5 shrink-0 ${left >= 0 ? "text-emerald-600" : "text-rose-600"}`} />
          <div>
            <p className={`text-sm font-semibold ${left >= 0 ? "text-emerald-800" : "text-rose-700"}`}>{left >= 0 ? `${money(left)} left this month` : `${money(-left)} over budget`}</p>
            <p className={`text-xs ${left >= 0 ? "text-emerald-700/80" : "text-rose-600/80"}`}>{left >= 0 ? "Great job managing your finances." : "Time to slow down a little."}</p>
          </div>
        </div>
      </div>
    </Widget>
  );
}

// ---------- Health ----------
export function HealthWidget({ data }: Props) {
  const { health } = data;
  const tile = (icon: ReactNode, label: string, value: ReactNode, sub: string, bar: ReactNode, bg: string) => (
    <div className={`rounded-xl p-2.5 ${bg}`}>
      {icon}
      <p className="mt-2 text-[11px] text-slate-500">{label}</p>
      <p className="text-base font-bold leading-tight text-slate-900">{value}</p>
      <p className="text-[11px] text-slate-500">{sub}</p>
      {bar}
    </div>
  );
  const sleepH = health.sleep_minutes !== null ? Math.floor(health.sleep_minutes / 60) : null;
  return (
    <Widget icon={<HeartPulse className="size-4.5" />} tile="bg-pink-50 text-pink-500" title="Health & Wellness" link={{ href: "/health", label: "View Details" }}>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {tile(<Footprints className="size-5 text-emerald-600" />, "Steps", health.steps !== null ? count(health.steps) : "—", `/ ${count(health.goals.steps)}`, <Progress value={pct(health.steps ?? 0, health.goals.steps)} fill="bg-emerald-500" track="bg-emerald-100" className="mt-2 h-1.5" />, "bg-emerald-50/70")}
        {tile(
          <Moon className="size-5 fill-violet-200 text-violet-600" />,
          "Sleep",
          sleepH !== null ? <>{sleepH}<small className="text-xs font-semibold">h</small> {health.sleep_minutes! % 60}<small className="text-xs font-semibold">m</small></> : "—",
          `/ ${hm(health.goals.sleep_minutes / 60)}`,
          <Progress value={pct(health.sleep_minutes ?? 0, health.goals.sleep_minutes)} fill="bg-violet-500" track="bg-violet-100" className="mt-2 h-1.5" />,
          "bg-violet-50/70",
        )}
        {tile(
          <HeartPulse className="size-5 text-pink-500" />,
          "Heart Rate",
          health.resting_hr !== null ? <>{health.resting_hr} <small className="text-xs font-semibold">bpm</small></> : "—",
          "Resting",
          <svg viewBox="0 0 60 12" className="mt-1.5 h-3 w-full text-pink-500" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M0 7h14l3-5 4 9 3-6 2 2h34" />
          </svg>,
          "bg-pink-50/70",
        )}
      </div>
      <div className="mt-auto pt-4">
        {health.steps === null && health.sleep_minutes === null ? (
          <Link href="/health?new=1" className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 p-3 text-sm font-medium text-blue-600 hover:bg-blue-50/40">
            <Plus className="size-4" /> Log today&apos;s health
          </Link>
        ) : (
          <p className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-xs italic text-slate-600">
            <Leaf className="size-4 shrink-0 text-emerald-600" />
            “A healthy mind fuels a brighter tomorrow.”
          </p>
        )}
      </div>
    </Widget>
  );
}

// ---------- Reminders ----------
export function RemindersWidget({ data }: Props) {
  const act = useAction();
  const [text, setText] = useState("");
  // Pinned notes first, then the latest (the API sorts them that way).
  const { data: notes } = useSWR<List<Note>>("/notes");
  const latest = notes?.items.slice(0, 3) ?? [];

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    setText("");
    await act(() => api("/reminders", { method: "POST", body: { text: value } }), "/reminders");
  };

  return (
    <Widget icon={<FileText className="size-4.5" />} tile="bg-sky-50 text-sky-600" title="Notes & Reminders" link={{ href: "/notes", label: "View All" }}>
      {latest.length > 0 && (
        <ul className="mt-4 space-y-2">
          {latest.map((note) => (
            <li key={note.id}>
              <Link href="/notes" className={`block rounded-xl border px-3 py-2 transition hover:shadow-sm ${colorOf(note.color).note}`}>
                <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                  {note.pinned && <Pin className="size-3.5 shrink-0 text-slate-400" />}
                  <span className="truncate">{note.title}</span>
                </p>
                {note.body && <p className="truncate text-xs text-slate-500">{note.body}</p>}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <ul className="mt-4 space-y-3">
        {data.reminders.map((r) => (
          <li key={r.id} className="flex items-start gap-2.5">
            <input id={`dr-${r.id}`} type="checkbox" className="checkbox peer mt-0.5" checked={r.done} onChange={() => act(() => api(`/reminders/${r.id}`, { method: "PATCH", body: { done: !r.done } }), "/reminders")} />
            <label htmlFor={`dr-${r.id}`} className="min-w-0 flex-1 text-sm text-slate-700 peer-checked:text-slate-400 peer-checked:line-through">
              {r.text}
              {r.due_date && <span className="text-slate-400"> (due {formatDate(r.due_date, "short")})</span>}
            </label>
          </li>
        ))}
        {!data.reminders.length && <li className="text-sm text-slate-500">No reminders. Add one below.</li>}
      </ul>
      <form onSubmit={add} className="mt-auto pt-4">
        <label className="flex items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-2.5 transition focus-within:border-blue-300 focus-within:bg-blue-50/40">
          <Plus className="size-4 shrink-0 text-slate-400" />
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={200} placeholder="Add a reminder…" className="min-w-0 flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400" />
        </label>
      </form>
    </Widget>
  );
}

// ---------- Learning: courses and this week's study plan ----------
export function LearningWidget() {
  const { data } = useSWR<LearningWeek>("/learning/week");
  const planned = data?.blocks.reduce((sum, b) => sum + Number(b.hours), 0) ?? 0;
  const studied = data?.blocks.filter((b) => b.done).reduce((sum, b) => sum + Number(b.hours), 0) ?? 0;
  const goal = data?.goal_hours ?? 0;

  return (
    <Widget icon={<GraduationCap className="size-4.5" />} tile="bg-violet-50 text-violet-600" title="Learning" link={{ href: "/learning", label: "View All" }}>
      {!data ? (
        <div className="mt-4 space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => <div key={i} className="h-10 animate-pulse rounded-xl bg-slate-100" />)}
        </div>
      ) : (
        <>
          <div className="mt-4 rounded-xl bg-violet-50/60 p-3 ring-1 ring-violet-100">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="font-medium text-slate-700">This week</span>
              <span className="text-slate-600">
                <b className="font-semibold text-slate-900">{hm(studied)}</b> of {hm(goal || planned)}
              </span>
            </div>
            <Progress value={pct(studied, goal || planned)} fill="bg-violet-500" track="bg-violet-100" className="mt-2 h-2" />
            {data.topic && <p className="mt-2 truncate text-xs text-slate-500">Focus: {data.topic}</p>}
          </div>
          {data.courses.length ? (
            <ul className="mt-3 divide-y divide-slate-100">
              {data.courses.slice(0, 4).map((course) => {
                const color = colorOf(course.color);
                return (
                  <li key={course.id}>
                    <Link href={`/learning/${course.id}`} className="block py-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <p className="min-w-0 truncate text-sm font-medium text-slate-800">{course.title}</p>
                        <span className={`shrink-0 whitespace-nowrap text-xs font-semibold ${color.text}`}>{course.percent}%</span>
                      </div>
                      <Progress value={course.percent} fill={color.bar} track="bg-slate-100" className="mt-1.5 h-1.5" />
                      <p className="mt-1 text-xs text-slate-400">
                        {hm(course.done_hours)} of {hm(course.est_hours)} · {course.days_left > 0 ? `${course.days_left} days left` : "Target date passed"}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-slate-500">
              No courses yet.{" "}
              <Link href="/learning" className="font-medium text-blue-600">Add a course</Link>
            </p>
          )}
        </>
      )}
    </Widget>
  );
}

// ---------- Job deadlines ----------
export function JobsWidget({ today }: { today: string }) {
  const { data } = useSWR<List<JobApplication>>("/jobs");
  const jobs = data?.items ?? [];
  // The API sorts by last date to apply; jobs you have already applied to are not "closing soon".
  const closing = jobs.filter((j) => j.status === "saved" && j.deadline && isOpen(j, today)).slice(0, 4);
  const count = (status: string) => jobs.filter((j) => j.status === status).length;

  return (
    <Widget icon={<BriefcaseBusiness className="size-4.5" />} tile="bg-rose-50 text-rose-600" title="Job Deadlines" link={{ href: "/jobs", label: "View All" }}>
      {!data ? (
        <div className="mt-4 space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => <div key={i} className="h-10 animate-pulse rounded-xl bg-slate-100" />)}
        </div>
      ) : closing.length ? (
        <ul className="mt-3 divide-y divide-slate-100">
          {closing.map((job) => {
            const label = deadlineLabel(job.deadline, today);
            const soon = daysBetween(today, job.deadline!) <= 3;
            return (
              <li key={job.id}>
                <Link href="/jobs" className="flex items-center justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-800">{job.title}</span>
                    <span className="block truncate text-xs text-slate-400">{job.company || "Not applied yet"}</span>
                  </span>
                  <span className={`badge shrink-0 ${soon ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="py-6 text-center text-sm text-slate-500">
          {jobs.length ? "No jobs closing soon. " : "No jobs saved yet. "}
          <Link href="/jobs" className="font-medium text-blue-600">{jobs.length ? "Open Job Apply" : "Add a job"}</Link>
        </p>
      )}
      {jobs.length > 0 && (
        <p className="mt-auto pt-3 text-xs text-slate-400">
          {count("saved")} saved · {count("applied")} applied · {count("interview")} interview
        </p>
      )}
    </Widget>
  );
}

// ---------- Productivity (tasks finished per day) ----------
export function ProductivityWidget({ data }: Props) {
  const { days, change } = data.productivity;
  const top = Math.max(4, ...days.map((d) => d.count));
  const ticks = [top, Math.round((top * 3) / 4), Math.round(top / 2), Math.round(top / 4), 0];
  return (
    <Widget icon={<ChartNoAxesColumn className="size-4.5" />} tile="bg-blue-50 text-blue-600" title="Productivity">
      <p className="mt-1 text-xs text-slate-500">Tasks finished, last 7 days</p>
      <div className="mt-4 flex h-40 gap-2">
        <div className="flex flex-col justify-between pb-5 text-right text-[10px] text-slate-400">
          {ticks.map((t, i) => (
            <span key={i}>{t}</span>
          ))}
        </div>
        <div className="relative flex-1">
          <div className="pointer-events-none absolute inset-x-0 bottom-5 top-1.5 flex flex-col justify-between">
            {ticks.map((_, i) => (
              <span key={i} className={`border-t ${i === ticks.length - 1 ? "border-slate-200" : "border-dashed border-slate-200"}`} />
            ))}
          </div>
          <div className="relative grid h-full grid-cols-7 gap-1.5">
            {days.map((d, i) => {
              const isToday = i === days.length - 1;
              return (
                <div key={d.date} className="flex flex-col items-center gap-1">
                  <div className="flex w-full flex-1 items-end justify-center pt-1.5">
                    <span className={`w-full max-w-5 rounded-t-md ${isToday ? "bg-blue-600" : "bg-blue-400"}`} style={{ height: `${(d.count / top) * 100}%` }} title={`${formatDate(d.date, "long")}: ${d.count} done`} />
                  </div>
                  <span className="whitespace-nowrap text-[10px] text-slate-500">{isToday ? "Today" : formatDate(d.date, "weekday")}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="mt-auto pt-4">
        <div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-3">
          <Sun className="size-5 shrink-0 text-amber-500" />
          <p className="text-sm font-medium text-emerald-800">
            {change === null
              ? `${data.productivity.this_week} tasks finished this week.`
              : change >= 0
                ? `You're ${change}% more productive than last week!`
                : `${Math.abs(change)}% fewer tasks than last week. You've got this.`}
          </p>
        </div>
      </div>
    </Widget>
  );
}
