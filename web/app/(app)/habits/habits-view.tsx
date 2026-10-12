"use client";

import { toArchive } from "@/lib/archive";
import { useState, type FormEvent, type ReactNode } from "react";
import useSWR from "swr";
import { ChartPie, CircleCheck, Flame, Lightbulb, Plus, Sparkles, TriangleAlert, Trophy } from "lucide-react";
import { api, errorMessage, refresh } from "@/lib/api";
import { formatDate } from "@/lib/dates";
import { useNewAction } from "@/lib/new-action";
import type { Habit, HabitsResponse } from "@/lib/types";
import { HABITS_KEY, HabitTracker } from "@/components/habits/habit-tracker";
import { ColorPicker, Field, IconPicker } from "@/components/ui/controls";
import { useFeedback } from "@/components/ui/feedback";
import { HABIT_ICONS } from "@/components/ui/icon";
import { Modal, ModalActions } from "@/components/ui/modal";
import { LoadError, PageHeader, PageSkeleton } from "@/components/ui/states";

export function HabitsView() {
  const { data, error, mutate } = useSWR<HabitsResponse>(HABITS_KEY);
  const { toast, confirm } = useFeedback();
  const [editing, setEditing] = useState<Habit | "new" | null>(null);
  useNewAction(() => setEditing("new"));

  if (error && !data) return <LoadError error={error} retry={() => mutate()} />;
  if (!data) return <PageSkeleton />;

  const { summary, days } = data;

  const remove = async (habit: Habit) => {
    if (!(await confirm({ title: "Delete this habit?", message: toArchive(`“${habit.name}” and all its history`) }))) return;
    // Gone from the list at once; it comes back if the delete fails.
    await mutate((current) => current && { ...current, items: current.items.filter((h) => h.id !== habit.id) }, { revalidate: false });
    try {
      await api(`/habits/${habit.id}`, { method: "DELETE" });
      toast("Habit moved to the Archive");
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
          value={`${summary.best.days} ${summary.best.days === 1 ? "day" : "days"}`}
          sub={summary.best.name}
        />
        <Summary icon={<ChartPie className="size-5" />} tile="bg-blue-50 text-blue-600" label="Last 7 days" value={`${summary.share}%`} />
        <Summary icon={<Sparkles className="size-5" />} tile="bg-violet-50 text-violet-600" label="Perfect days" value={`${summary.perfect_days} of ${days.length}`} />
      </div>

      <HabitTracker className="mt-6" data={data} mutate={mutate} onEdit={setEditing} onDelete={remove} onNew={() => setEditing("new")} />

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
            <div className="grid grid-rows-7 gap-0.5 text-[10px] text-slate-400 sm:gap-1.5 [&>span]:self-center">
              <span>Mon</span><span /><span>Wed</span><span /><span>Fri</span><span /><span>Sun</span>
            </div>
            <div className="grid flex-1 auto-cols-fr grid-flow-col grid-rows-7 gap-0.5 sm:gap-1.5">
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

function Summary({ icon, tile, label, value, sub }: { icon: ReactNode; tile: string; label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="card flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
      <span className={`icon-tile size-11 shrink-0 max-[380px]:hidden ${tile}`}>{icon}</span>
      <div className="min-w-0">
        <p className="text-sm text-slate-500">{label}</p>
        <p className="truncate text-xl font-bold text-slate-900">{value}</p>
        {sub && <p className="truncate text-xs text-slate-500">{sub}</p>}
      </div>
    </div>
  );
}

function Insight({ icon, tile, title, text }: { icon: ReactNode; tile: string; title: string; text: string }) {
  return (
    <li className="flex gap-3">
      <span className={`icon-tile size-9 shrink-0 ${tile}`}>{icon}</span>
      <div className="min-w-0">
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
