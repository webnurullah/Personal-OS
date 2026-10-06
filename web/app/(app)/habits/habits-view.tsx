"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import useSWR from "swr";
import { ChartPie, CircleCheck, Flame, Lightbulb, Pencil, Plus, Repeat, Sparkles, Trash2, TriangleAlert, Trophy } from "lucide-react";
import { api, errorMessage, refresh } from "@/lib/api";
import { colorOf } from "@/lib/colors";
import { formatDate } from "@/lib/dates";
import { useNewAction } from "@/lib/new-action";
import type { Habit, HabitsResponse } from "@/lib/types";
import { Progress } from "@/components/ui/charts";
import { ColorPicker, Field, IconPicker } from "@/components/ui/controls";
import { useFeedback } from "@/components/ui/feedback";
import { HABIT_ICONS, Icon } from "@/components/ui/icon";
import { Modal, ModalActions } from "@/components/ui/modal";
import { EmptyState, LoadError, PageHeader, PageSkeleton } from "@/components/ui/states";

const KEY = "/habits?days=7";

export function HabitsView() {
  const { data, error, mutate } = useSWR<HabitsResponse>(KEY);
  const { toast, confirm } = useFeedback();
  const [editing, setEditing] = useState<Habit | "new" | null>(null);
  useNewAction(() => setEditing("new"));

  if (error && !data) return <LoadError error={error} retry={() => mutate()} />;
  if (!data) return <PageSkeleton />;

  const { summary, days } = data;

  // Instant tick: flip the dot on screen first, then save and reload the streaks.
  const toggle = async (habit: Habit, index: number) => {
    const done = habit.done[index];
    await mutate({ ...data, items: data.items.map((h) => (h.id === habit.id ? { ...h, done: h.done.map((d, i) => (i === index ? !done : d)) } : h)) }, { revalidate: false });
    try {
      await api(`/habits/${habit.id}/logs/${days[index]}`, { method: done ? "DELETE" : "PUT" });
    } catch (e) {
      toast(errorMessage(e), "error");
    }
    await refresh("/habits");
  };

  const remove = async (habit: Habit) => {
    if (!(await confirm({ title: "Delete this habit?", message: `“${habit.name}” and all its history will be removed.` }))) return;
    // Gone from the list at once; it comes back if the delete fails.
    await mutate((current) => current && { ...current, items: current.items.filter((h) => h.id !== habit.id) }, { revalidate: false });
    try {
      await api(`/habits/${habit.id}`, { method: "DELETE" });
      toast("Habit deleted");
    } catch (e) {
      toast(errorMessage(e), "error");
    }
    await refresh("/habits");
  };

  return (
    <>
      <PageHeader title="Habits" description="Small daily wins add up to a big life.">
        <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
          <Plus className="size-4" />
          New Habit
        </button>
      </PageHeader>

      <div className="mt-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Summary icon={<CircleCheck className="size-5" />} tile="bg-emerald-50 text-emerald-600" label="Done today" value={`${summary.done_today} / ${summary.total}`} />
        <Summary
          icon={<Flame className="size-5" />}
          tile="bg-orange-50 text-orange-500"
          label="Best streak"
          value={<>{summary.best.days} {summary.best.days === 1 ? "day" : "days"} {summary.best.name && <span className="text-sm font-medium text-slate-500">{summary.best.name}</span>}</>}
        />
        <Summary icon={<ChartPie className="size-5" />} tile="bg-blue-50 text-blue-600" label="Last 7 days" value={`${summary.share}%`} />
        <Summary icon={<Sparkles className="size-5" />} tile="bg-violet-50 text-violet-600" label="Perfect days" value={`${summary.perfect_days} of ${days.length}`} />
      </div>

      <section className="card mt-6 p-5" aria-labelledby="tracker-title">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="tracker-title" className="card-title">Last 7 days</h2>
          <p className="text-xs text-slate-500">Tap a day to tick or untick it. Streaks update straight away.</p>
        </header>
        {data.items.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="text-xs text-slate-500">
                  <th className="pb-3 text-left font-medium">Habit</th>
                  {days.map((day, i) => {
                    const isToday = i === days.length - 1;
                    return (
                      <th key={day} className="pb-3 text-center font-medium">
                        <span className={`block ${isToday ? "text-blue-600" : ""}`}>{isToday ? "Today" : formatDate(day, "weekday")}</span>
                        <span className={`mt-0.5 inline-grid size-6 place-items-center rounded-full text-[11px] ${isToday ? "bg-blue-600 text-white" : "text-slate-400"}`}>{Number(day.slice(8))}</span>
                      </th>
                    );
                  })}
                  <th className="pb-3 text-center font-medium">Streak</th>
                  <th className="pb-3 pl-4 text-left font-medium">This week</th>
                  <th className="pb-3" />
                </tr>
              </thead>
              <tbody>
                {data.items.map((habit) => (
                  <tr key={habit.id} className="group border-t border-slate-100">
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-3">
                        <span className={`icon-tile ${colorOf(habit.color).tile}`}>
                          <Icon name={habit.icon} className="size-4.5" />
                        </span>
                        <div>
                          <p className="font-medium text-slate-800">{habit.name}</p>
                          {habit.goal_text && <p className="text-xs text-slate-500">{habit.goal_text}</p>}
                        </div>
                      </div>
                    </td>
                    {habit.done.map((done, i) => (
                      <td key={days[i]} className="text-center">
                        <button
                          type="button"
                          className={`habit-dot habit-dot-lg ${i === days.length - 1 ? "is-today" : ""}`}
                          aria-pressed={done}
                          aria-label={`${habit.name} · ${i === days.length - 1 ? "Today" : formatDate(days[i], "long")}`}
                          onClick={() => toggle(habit, i)}
                        />
                      </td>
                    ))}
                    <td className="text-center">
                      <span className="inline-flex items-center gap-1 font-semibold text-slate-800">
                        <Flame className="size-4 text-orange-500" />
                        {habit.streak}
                      </span>
                    </td>
                    <td className="pl-4">
                      <div className="flex w-36 items-center gap-2">
                        <Progress value={habit.share} fill="bg-emerald-500" className="h-1.5 flex-1" />
                        <span className="w-9 text-right text-xs font-semibold text-slate-600">{habit.share}%</span>
                      </div>
                    </td>
                    <td className="w-20 text-right">
                      <span className="inline-flex opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                        <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => setEditing(habit)} aria-label={`Edit ${habit.name}`}>
                          <Pencil className="size-4" />
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => remove(habit)} aria-label={`Delete ${habit.name}`}>
                          <Trash2 className="size-4" />
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={Repeat} title="No habits yet" text="Start with one small habit. You can always add more.">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing("new")}>
              <Plus className="size-4" /> New habit
            </button>
          </EmptyState>
        )}
      </section>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="card p-5" aria-labelledby="heat-title">
          <header className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 id="heat-title" className="card-title">Consistency</h2>
              <p className="text-xs text-slate-500">Share of habits done each day, last 20 weeks</p>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
              Less
              <span className="size-3 rounded-[3px] bg-slate-100" />
              <span className="size-3 rounded-[3px] bg-emerald-100" />
              <span className="size-3 rounded-[3px] bg-emerald-300" />
              <span className="size-3 rounded-[3px] bg-emerald-500" />
              <span className="size-3 rounded-[3px] bg-emerald-700" />
              More
            </div>
          </header>
          <div className="mt-5 flex gap-3">
            <div className="grid grid-rows-7 gap-1 text-[10px] text-slate-400 sm:gap-1.5 [&>span]:self-center">
              <span>Mon</span><span /><span>Wed</span><span /><span>Fri</span><span /><span>Sun</span>
            </div>
            <div className="grid flex-1 auto-cols-fr grid-flow-col grid-rows-7 gap-1 sm:gap-1.5">
              {data.heatmap.map((cell) => {
                if (cell.share === null) return <span key={cell.date} className="aspect-square" />;
                const tone = cell.share === 0 ? "bg-slate-100" : cell.share < 0.5 ? "bg-emerald-100" : cell.share < 0.8 ? "bg-emerald-300" : cell.share < 1 ? "bg-emerald-500" : "bg-emerald-700";
                return <span key={cell.date} className={`aspect-square rounded-[4px] ${tone} ${cell.date === data.today ? "ring-2 ring-blue-400 ring-offset-1" : ""}`} title={`${formatDate(cell.date, "long")}: ${Math.round(cell.share * 100)}% done`} />;
              })}
            </div>
          </div>
        </section>

        <section className="card p-5" aria-labelledby="insight-title">
          <h2 id="insight-title" className="card-title">Insights</h2>
          <ul className="mt-4 space-y-4 text-sm">
            <Insight icon={<Trophy className="size-4.5" />} tile="bg-emerald-50 text-emerald-600" title="Most consistent" text={summary.most_consistent ? `${summary.most_consistent.name} · ${summary.most_consistent.share}% this week` : "Add habits to see this."} />
            <Insight icon={<TriangleAlert className="size-4.5" />} tile="bg-amber-50 text-amber-600" title="Needs attention" text={summary.needs_attention ? `${summary.needs_attention.name} · ${summary.needs_attention.share}% this week` : "Nothing yet."} />
            <Insight icon={<Lightbulb className="size-4.5" />} tile="bg-blue-50 text-blue-600" title="Tip" text="Stack a new habit on an old one: “After I brush my teeth, I will meditate for 2 minutes.”" />
          </ul>
        </section>
      </div>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing && editing !== "new" ? "Edit habit" : "New habit"} description="Start small. You can grow it later.">
        <HabitForm editing={editing && editing !== "new" ? editing : null} onClose={() => setEditing(null)} />
      </Modal>
    </>
  );
}

function Summary({ icon, tile, label, value }: { icon: ReactNode; tile: string; label: string; value: ReactNode }) {
  return (
    <div className="card flex items-center gap-4 p-4">
      <span className={`icon-tile size-11 ${tile}`}>{icon}</span>
      <div className="min-w-0">
        <p className="text-sm text-slate-500">{label}</p>
        <p className="truncate text-xl font-bold text-slate-900">{value}</p>
      </div>
    </div>
  );
}

function Insight({ icon, tile, title, text }: { icon: ReactNode; tile: string; title: string; text: string }) {
  return (
    <li className="flex gap-3">
      <span className={`icon-tile size-9 ${tile}`}>{icon}</span>
      <div>
        <p className="font-medium text-slate-800">{title}</p>
        <p className="text-slate-500">{text}</p>
      </div>
    </li>
  );
}

function HabitForm({ editing, onClose }: { editing: Habit | null; onClose: () => void }) {
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const body = {
      name: String(form.get("name")),
      goal_text: String(form.get("goal_text")),
      icon: String(form.get("icon") || "circle-check"),
      color: String(form.get("color") || "emerald"),
    };
    setBusy(true);
    try {
      await api(editing ? `/habits/${editing.id}` : "/habits", { method: editing ? "PATCH" : "POST", body });
      await refresh("/habits");
      toast(editing ? "Habit saved" : "Habit added. Tick today to start your streak!");
      onClose();
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Habit" htmlFor="habit-name">
        <input id="habit-name" name="name" className="input" required maxLength={80} defaultValue={editing?.name} placeholder="e.g. Walk 5,000 steps" autoComplete="off" autoFocus />
      </Field>
      <Field label="Goal" htmlFor="habit-goal">
        <input id="habit-goal" name="goal_text" className="input" maxLength={80} defaultValue={editing?.goal_text} placeholder="e.g. 20 min · every day" autoComplete="off" />
      </Field>
      <Field label="Icon">
        <IconPicker name="icon" value={editing?.icon ?? "footprints"} icons={HABIT_ICONS} />
      </Field>
      <Field label="Colour">
        <ColorPicker name="color" value={editing?.color ?? "emerald"} />
      </Field>
      <ModalActions onCancel={onClose} submitLabel={editing ? "Save habit" : "Add habit"} busy={busy} />
    </form>
  );
}
