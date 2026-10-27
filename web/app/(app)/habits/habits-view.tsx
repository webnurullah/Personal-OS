"use client";

import { toArchive } from "@/lib/archive";
import { useState, type FormEvent, type ReactNode } from "react";
import useSWR from "swr";
import { ChartPie, ChevronLeft, ChevronRight, CircleCheck, Flame, Lightbulb, Plus, Sparkles, TriangleAlert, Trophy } from "lucide-react";
import { api, errorMessage, refresh } from "@/lib/api";
import { formatDate } from "@/lib/dates";
import { minutesText } from "@/lib/habit-time";
import { presetWindow, windowDays, windowKey, windowProblem, windowTitle, type RangePreset } from "@/lib/habit-range";
import { useProfile } from "@/lib/profile";
import { useNewAction } from "@/lib/new-action";
import type { Habit, HabitsResponse } from "@/lib/types";
import { HABITS_KEY, HabitTracker } from "@/components/habits/habit-tracker";
import { ProjectTimeCard } from "@/components/habits/project-time-card";
import { ColorPicker, Field, IconPicker, Segmented } from "@/components/ui/controls";
import { useFeedback } from "@/components/ui/feedback";
import { HABIT_ICONS } from "@/components/ui/icon";
import { Modal, ModalActions } from "@/components/ui/modal";
import { LoadError, PageHeader, PageSkeleton } from "@/components/ui/states";

export function HabitsView() {
  const { profile } = useProfile();
  const { toast, confirm } = useFeedback();
  const [editing, setEditing] = useState<Habit | "new" | null>(null);
  useNewAction(() => setEditing("new"));

  // The date range of the tracker. The last 7 days (the default) is the answer the Dashboard shares; other ranges ask for exact dates.
  const [preset, setPreset] = useState<RangePreset>("7d");
  const [offset, setOffset] = useState(0);
  const [custom, setCustom] = useState<{ from: string; to: string } | null>(null);
  const base = useSWR<HabitsResponse>(HABITS_KEY);
  const today = base.data?.today;
  const picked = today ? (preset === "custom" ? custom ?? presetWindow("7d", today) : presetWindow(preset, today, offset, profile?.week_start ?? 1)) : null;
  const usable = Boolean(today && picked && preset !== "7d" && !(preset === "custom" && windowProblem(picked, today)));
  const ranged = useSWR<HabitsResponse>(usable && picked ? windowKey(preset, picked) : null);
  const active = preset === "7d" || !usable ? base : ranged;
  const data = preset === "7d" || !usable ? base.data : ranged.data ?? base.data;
  const { error, mutate } = active;

  if (error && !data) return <LoadError error={error} retry={() => mutate()} />;
  if (!data) return <PageSkeleton />;

  const { summary, days } = data;
  const shown = data.range ?? { from: days[0], to: days[days.length - 1] };
  const title = windowTitle(preset, shown);

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
      <PageHeader title="Habits" description="Small daily wins add up to a big life. Show up today.">
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
        <Summary icon={<ChartPie className="size-5" />} tile="bg-blue-50 text-blue-600" label={title} value={`${summary.share}%`} />
        <Summary icon={<Sparkles className="size-5" />} tile="bg-violet-50 text-violet-600" label="Perfect days" value={`${summary.perfect_days} of ${days.length}`} />
      </div>

      <HabitTracker
        className="mt-6"
        data={data}
        mutate={mutate}
        title={title}
        shareLabel={preset === "7d" ? "This week" : "In range"}
        rangeBar={today && <RangeBar today={today} preset={preset} offset={offset} custom={picked ?? { from: today, to: today }} onPreset={(p) => { setPreset(p); setOffset(0); if (p === "custom" && !custom) setCustom(presetWindow("7d", today, 0)); }} onOffset={setOffset} onCustom={setCustom} />}
        onEdit={setEditing}
        onDelete={remove}
        onNew={() => setEditing("new")}
      />

      <ProjectTimeCard className="mt-5" />

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

/** The date range buttons of the tracker: last 7 days, a week, a month (with arrows to earlier ones), or two dates picked by hand. */
function RangeBar({ today, preset, offset, custom, onPreset, onOffset, onCustom }: {
  today: string; preset: RangePreset; offset: number; custom: { from: string; to: string };
  onPreset: (preset: RangePreset) => void; onOffset: (offset: number) => void; onCustom: (range: { from: string; to: string }) => void;
}) {
  const [from, setFrom] = useState(custom.from);
  const [to, setTo] = useState(custom.to);
  const problem = preset === "custom" ? windowProblem({ from, to }, today) : "";
  const change = (next: { from: string; to: string }) => {
    setFrom(next.from);
    setTo(next.to);
    if (!windowProblem(next, today)) onCustom(next);
  };
  return (
    <>
      {preset === "custom" && (
        <div className="order-last flex w-full flex-wrap items-center justify-center gap-x-3 gap-y-2 text-sm text-slate-600 sm:order-none sm:w-auto sm:flex-1">
          <label className="flex items-center gap-2" htmlFor="range-from">From
            <input id="range-from" type="date" className="input !h-9 !w-auto" value={from} max={today} onChange={(e) => change({ from: e.target.value, to })} />
          </label>
          <label className="flex items-center gap-2" htmlFor="range-to">To
            <input id="range-to" type="date" className="input !h-9 !w-auto" value={to} max={today} onChange={(e) => change({ from, to: e.target.value })} />
          </label>
          {problem ? <span className="text-rose-600" role="alert">{problem}</span> : <span className="text-slate-500">{windowDays({ from, to })} days</span>}
        </div>
      )}
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        <Segmented
          label="Date range"
          value={preset}
          onChange={onPreset}
          options={[
            { value: "7d", label: "Last 7 days" },
            { value: "week", label: "Week" },
            { value: "month", label: "Month" },
            { value: "custom", label: "Custom" },
          ]}
        />
        {(preset === "week" || preset === "month") && (
          <div className="flex gap-1">
            <button type="button" className="btn btn-secondary btn-sm btn-icon" aria-label={`Earlier ${preset}`} onClick={() => onOffset(offset - 1)}><ChevronLeft className="size-4" /></button>
            <button type="button" className="btn btn-secondary btn-sm btn-icon" aria-label={`Later ${preset}`} disabled={offset >= 0} onClick={() => onOffset(Math.min(0, offset + 1))}><ChevronRight className="size-4" /></button>
          </div>
        )}
      </div>
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
  // A time goal: the minutes a day, and the projects and courses whose timer counts for it.
  // One goal, two ways: "I tick it" (a goal in words) or "Timer counts it" (minutes a day, ticked for you when the timers reach it).
  const [mode, setMode] = useState<"tick" | "timer">(editing?.target_minutes ? "timer" : "tick");
  const [minutes, setMinutes] = useState(editing?.target_minutes ? String(editing.target_minutes) : "");
  const [picked, setPicked] = useState<Set<string>>(new Set((editing?.sources ?? []).map((s) => `${s.kind}:${s.id}`)));
  const { data: projects } = useSWR<{ items: { id: string; name: string; status: string }[] }>("/projects");
  const { data: courses } = useSWR<{ items: { id: string; title: string; status?: string }[] }>("/courses");
  const options = [
    ...(projects?.items ?? []).filter((p) => p.status !== "done" || picked.has(`project:${p.id}`)).map((p) => ({ key: `project:${p.id}`, kind: "project" as const, id: p.id, name: p.name })),
    ...(courses?.items ?? []).filter((c) => c.status !== "done" || picked.has(`course:${c.id}`)).map((c) => ({ key: `course:${c.id}`, kind: "course" as const, id: c.id, name: c.title })),
  ];
  const goal = Number(minutes);
  const timed = mode === "timer";
  const goalBad = timed && (minutes === "" || !Number.isInteger(goal) || goal < 1 || goal > 1440);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (goalBad) return toast("Give the daily goal as a whole number of minutes, from 1 to 1440.", "error");
    const form = new FormData(e.currentTarget);
    const body = {
      name: String(form.get("name")),
      goal_text: timed ? `${minutesText(goal)} daily` : String(form.get("goal_text") ?? ""),
      icon: String(form.get("icon") || "circle-check"),
      color: String(form.get("color") || "emerald"),
      target_minutes: timed ? goal : null,
      sources: !timed ? [] : options.filter((o) => picked.has(o.key)).map((o) => ({ kind: o.kind, id: o.id })),
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
      <Field label="Goal">
        <Segmented
          label="How you track it"
          value={mode}
          onChange={setMode}
          options={[
            { value: "tick", label: "I tick it myself" },
            { value: "timer", label: "Timer counts it" },
          ]}
        />
      </Field>
      {mode === "tick" ? (
        <Field label="Goal in words" htmlFor="habit-goal">
          <input id="habit-goal" name="goal_text" className="input" maxLength={80} defaultValue={editing?.goal_text} placeholder="e.g. 20 min · every day" autoComplete="off" />
        </Field>
      ) : (
        <Field label="Daily time goal (minutes)" htmlFor="habit-minutes" hint="When the timers of the projects and courses you pick below add up to this today, the day is ticked for you. You can still tick it yourself.">
          <div className="flex flex-wrap items-center gap-2">
            <input id="habit-minutes" type="number" inputMode="numeric" min={1} max={1440} step={1} className="input w-28" value={minutes} onChange={(e) => setMinutes(e.target.value)} placeholder="e.g. 120" />
            {[30, 60, 120].map((m) => (
              <button key={m} type="button" className={`btn btn-sm ${minutes === String(m) ? "btn-primary" : "btn-secondary"}`} onClick={() => setMinutes(String(m))}>{minutesText(m)}</button>
            ))}
          </div>
        </Field>
      )}
      {timed && (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-700">Counts time from</legend>
          {options.length ? (
            <ul className="max-h-44 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
              {options.map((o) => (
                <li key={o.key}>
                  <label className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                    <input type="checkbox" className="checkbox" checked={picked.has(o.key)} onChange={() => setPicked((p) => { const next = new Set(p); if (next.has(o.key)) next.delete(o.key); else next.add(o.key); return next; })} />
                    <span className="min-w-0 truncate">{o.name}</span>
                    <span className="ml-auto shrink-0 text-xs text-slate-400">{o.kind === "project" ? "Project" : "Course"}</span>
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">Add a project or a course first, then pick it here.</p>
          )}
          {picked.size === 0 && options.length > 0 && <p className="text-xs text-amber-700">Pick at least one, or no time will count.</p>}
        </fieldset>
      )}
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
