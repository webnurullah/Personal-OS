"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import useSWR from "swr";
import { Footprints, Frown, GlassWater, HeartPulse, Laugh, Meh, Minus, Moon, Plus, Scale, Smile, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import { api, errorMessage, refresh } from "@/lib/api";
import { addDays, formatDate, relativeDay } from "@/lib/dates";
import { count, hm, pct } from "@/lib/format";
import { useNewAction } from "@/lib/new-action";
import type { HealthLog, HealthResponse } from "@/lib/types";
import { Donut, Sparkline } from "@/components/ui/charts";
import { Field } from "@/components/ui/controls";
import { useFeedback } from "@/components/ui/feedback";
import { Modal, ModalActions } from "@/components/ui/modal";
import { LoadError, PageHeader, PageSkeleton } from "@/components/ui/states";

const KEY = "/health?days=30";

const EMPTY: Omit<HealthLog, "log_date"> = { steps: null, sleep_minutes: null, resting_hr: null, weight_kg: null, water_glasses: 0, mood: null };
type Changes = Partial<Omit<HealthLog, "log_date">>;

/** Puts one day's changes into the list (adding the day if it is new), oldest first. */
function withDay(logs: HealthLog[], date: string, changes: Changes) {
  const found = logs.some((l) => l.log_date === date);
  const next = found ? logs.map((l) => (l.log_date === date ? { ...l, ...changes } : l)) : [...logs, { ...EMPTY, ...changes, log_date: date }];
  return next.sort((a, b) => a.log_date.localeCompare(b.log_date));
}

const average = (list: number[]) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0);

function moodStyle(score: number | null): [LucideIcon, string, string, string] {
  if (score === null) return [Smile, "Not rated yet", "bg-slate-100 text-slate-400", "text-slate-500"];
  if (score <= 3) return [Frown, "Having a hard day", "bg-slate-100 text-slate-500", "text-slate-500"];
  if (score <= 5) return [Meh, "Getting by", "bg-amber-50 text-amber-500", "text-amber-600"];
  if (score <= 7) return [Smile, "Feeling good", "bg-emerald-50 text-emerald-500", "text-emerald-600"];
  return [Laugh, "Feeling great", "bg-pink-50 text-pink-500", "text-pink-600"];
}

export function HealthView() {
  const { data, error, mutate } = useSWR<HealthResponse>(KEY);
  const { toast } = useFeedback();
  const [logging, setLogging] = useState(false);
  // Water clicks not saved yet: quick clicks add up, and one save is sent when they stop.
  const water = useRef<{ timer: ReturnType<typeof setTimeout> | null; value: number | null }>({ timer: null, value: null });
  useNewAction(() => setLogging(true));
  useEffect(() => {
    const pending = water.current;
    return () => {
      if (pending.timer) clearTimeout(pending.timer);
    };
  }, []);

  if (error && !data) return <LoadError error={error} retry={() => mutate()} />;
  if (!data) return <PageSkeleton />;

  const { today, goals, logs } = data;
  const byDate = new Map(logs.map((l) => [l.log_date, l]));
  const todayLog = byDate.get(today) ?? { ...EMPTY, log_date: today };
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const fortnight = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
  const stepsWeek = week.map((d) => byDate.get(d)?.steps ?? null);
  const sleepWeek = week.map((d) => byDate.get(d)?.sleep_minutes ?? null);
  const hrPoints = fortnight.flatMap((d) => {
    const value = byDate.get(d)?.resting_hr;
    return value ? [{ date: d, value: Number(value) }] : [];
  });
  const weights = logs.flatMap((l) => (l.weight_kg !== null ? [{ date: l.log_date, value: Number(l.weight_kg) }] : []));
  const latestHr = [...logs].reverse().find((l) => l.resting_hr !== null);
  const latestWeight = weights[weights.length - 1];
  const weightChange = weights.length > 1 ? latestWeight.value - weights[0].value : null;

  const stepsLogged = stepsWeek.filter((v): v is number => v !== null);
  const sleepLogged = sleepWeek.filter((v): v is number => v !== null);
  const sleepGoalHours = goals.sleep_minutes / 60;

  /** Shows the change straight away, then saves it. */
  const saveDay = async (date: string, changes: Changes, message?: string) => {
    await mutate((current) => current && { ...current, logs: withDay(current.logs, date, changes) }, { revalidate: false });
    try {
      await api(`/health/${date}`, { method: "PUT", body: changes });
      if (message) toast(message);
    } catch (e) {
      toast(errorMessage(e), "error");
    }
    await refresh("/health");
  };

  // Water: update at once, save once the clicking stops.
  const addWater = (glasses: number) => {
    const pending = water.current;
    const value = Math.max(0, Math.min(50, (pending.value ?? todayLog.water_glasses) + glasses));
    pending.value = value;
    mutate((current) => current && { ...current, logs: withDay(current.logs, today, { water_glasses: value }) }, { revalidate: false });
    if (glasses > 0 && value === goals.water) toast("Water goal reached. Nice!");
    if (pending.timer) clearTimeout(pending.timer);
    pending.timer = setTimeout(async () => {
      pending.timer = null;
      try {
        await api(`/health/${today}`, { method: "PUT", body: { water_glasses: value } });
      } catch (e) {
        toast(errorMessage(e), "error");
      }
      // Reload only if no newer click is waiting to be saved.
      if (!pending.timer) {
        pending.value = null;
        await refresh("/health");
      }
    }, 600);
  };

  const stepShare = todayLog.steps !== null ? pct(todayLog.steps, goals.steps) : 0;
  const sleepShare = todayLog.sleep_minutes !== null ? pct(todayLog.sleep_minutes, goals.sleep_minutes) : 0;
  const [MoodIcon, moodLabel, moodTile, moodTone] = moodStyle(todayLog.mood);
  const hr = latestHr?.resting_hr ?? null;

  return (
    <>
      <PageHeader title="Health" description="Small healthy choices, every day.">
        <button type="button" className="btn btn-primary" onClick={() => setLogging(true)}>
          <HeartPulse className="size-4" />
          Log Today
        </button>
      </PageHeader>

      {/* Today */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6 min-[100rem]:grid-cols-5">
        <section className="card p-5 xl:col-span-2 min-[100rem]:col-span-1" aria-label="Steps today">
          <CardTitle icon={Footprints} tile="bg-emerald-50 text-emerald-600" title="Steps" note={`Goal ${count(goals.steps)}`} />
          <div className="mt-4 flex items-center gap-4">
            <Ring share={stepShare} color="#10b981" />
            <div>
              <p className="text-3xl font-bold text-slate-900">{todayLog.steps !== null ? count(todayLog.steps) : "–"}</p>
              <p className="text-sm text-slate-500">
                {todayLog.steps === null ? "Not logged yet" : todayLog.steps >= goals.steps ? "Goal reached!" : `${count(goals.steps - todayLog.steps)} to go`}
              </p>
            </div>
          </div>
        </section>

        <section className="card p-5 xl:col-span-2 min-[100rem]:col-span-1" aria-label="Sleep last night">
          <CardTitle icon={Moon} tile="bg-violet-50 text-violet-600" title="Sleep" note={`Goal ${hm(sleepGoalHours)}`} />
          <div className="mt-4 flex items-center gap-4">
            <Ring share={sleepShare} color="#8b5cf6" />
            <div>
              <p className="text-3xl font-bold text-slate-900">{todayLog.sleep_minutes !== null ? hm(todayLog.sleep_minutes / 60) : "–"}</p>
              <p className="text-sm text-slate-500">{todayLog.sleep_minutes !== null ? "last night" : "Not logged yet"}</p>
            </div>
          </div>
        </section>

        <section className="card p-5 xl:col-span-2 min-[100rem]:col-span-1" aria-label="Resting heart rate">
          <CardTitle icon={HeartPulse} tile="bg-pink-50 text-pink-500" title="Heart rate" note="Resting" />
          <p className="mt-4 text-3xl font-bold text-slate-900">
            {hr ?? "–"} <span className="text-lg font-semibold text-slate-500">bpm</span>
          </p>
          <p className={`text-sm ${hr === null ? "text-slate-500" : hr > 100 ? "text-rose-600" : hr < 60 ? "text-amber-600" : "text-emerald-600"}`}>
            {hr === null ? "Not logged yet" : hr > 100 ? "Above 100: talk to a doctor if it stays high" : hr < 60 ? "Below 60 (normal if you are very fit)" : "In the healthy range (60–100)"}
            {latestHr && latestHr.log_date !== today && <span className="text-slate-400"> · {relativeDay(latestHr.log_date, today).toLowerCase()}</span>}
          </p>
          <Sparkline values={hrPoints.slice(-7).map((p) => p.value)} className="mt-3 h-7 w-full text-pink-500" />
        </section>

        <section className="card p-5 xl:col-span-3 min-[100rem]:col-span-1" aria-label="Water today">
          <CardTitle icon={GlassWater} tile="bg-sky-50 text-sky-600" title="Water" note={`Goal ${goals.water} glasses`} />
          <p className="mt-4 text-3xl font-bold text-slate-900">
            {todayLog.water_glasses} <span className="text-lg font-semibold text-slate-400">/ {goals.water}</span>
          </p>
          <div className="mt-2 flex flex-wrap gap-1" aria-hidden>
            {Array.from({ length: Math.max(goals.water, todayLog.water_glasses) }, (_, i) => (
              <GlassWater key={i} className={`size-5 ${i < todayLog.water_glasses ? "fill-sky-200 text-sky-500" : "text-slate-300"}`} />
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button type="button" className="btn btn-secondary btn-sm btn-icon" onClick={() => addWater(-1)} disabled={todayLog.water_glasses <= 0} aria-label="Remove a glass">
              <Minus className="size-4" />
            </button>
            <button type="button" className="btn btn-primary btn-sm flex-1" onClick={() => addWater(1)}>
              <Plus className="size-4" />
              Add a glass
            </button>
          </div>
        </section>

        <section className="card p-5 sm:col-span-2 xl:col-span-3 min-[100rem]:col-span-1" aria-label="Weight">
          <CardTitle icon={Scale} tile="bg-amber-50 text-amber-600" title="Weight" note="Last 30 days" />
          <p className="mt-4 text-3xl font-bold text-slate-900">
            {latestWeight ? latestWeight.value.toFixed(1) : "–"} <span className="text-lg font-semibold text-slate-500">kg</span>
          </p>
          {weightChange === null ? (
            <p className="text-sm text-slate-500">{latestWeight ? `Logged ${relativeDay(latestWeight.date, today).toLowerCase()}` : "Not logged yet"}</p>
          ) : (
            <p className={`flex items-center gap-1 text-sm ${weightChange <= 0 ? "text-emerald-600" : "text-amber-600"}`}>
              {weightChange <= 0 ? <TrendingDown className="size-4" /> : <TrendingUp className="size-4" />}
              {Math.abs(weightChange).toFixed(1)} kg {weightChange <= 0 ? "down" : "up"} in 30 days
            </p>
          )}
          <Sparkline values={weights.map((w) => w.value)} className="mt-3 h-7 w-full text-amber-500" />
        </section>
      </div>

      {/* Last 7 days */}
      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
        <section className="card p-5" aria-labelledby="steps-title">
          <header className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 id="steps-title" className="card-title">Steps</h2>
              <p className="text-xs text-slate-500">
                Last 7 days · average <b className="text-slate-700">{stepsLogged.length ? count(average(stepsLogged)) : "–"}</b>
              </p>
            </div>
            <span className="badge bg-emerald-50 text-emerald-700">{stepsLogged.filter((v) => v >= goals.steps).length} days hit the goal</span>
          </header>
          <BarChart
            days={week}
            today={today}
            values={stepsWeek}
            goal={goals.steps}
            max={Math.max(goals.steps * 1.2, ...stepsLogged)}
            done="bg-emerald-500"
            notDone="bg-emerald-200"
            format={(v) => count(v)}
          />
        </section>

        <section className="card p-5" aria-labelledby="sleep-title">
          <header className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 id="sleep-title" className="card-title">Sleep</h2>
              <p className="text-xs text-slate-500">
                Last 7 nights · average <b className="text-slate-700">{sleepLogged.length ? hm(average(sleepLogged) / 60) : "–"}</b>
              </p>
            </div>
            <span className="badge bg-violet-50 text-violet-700">
              {sleepLogged.filter((v) => v >= goals.sleep_minutes).length} nights of {hm(sleepGoalHours)}+
            </span>
          </header>
          <BarChart
            days={week}
            today={today}
            values={sleepWeek}
            goal={goals.sleep_minutes}
            max={Math.max(goals.sleep_minutes * 1.25, ...sleepLogged)}
            done="bg-violet-500"
            notDone="bg-violet-200"
            format={(v) => hm(v / 60)}
          />
        </section>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <section className="card p-5" aria-labelledby="hr-title">
          <header className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 id="hr-title" className="card-title">Resting heart rate</h2>
              <p className="text-xs text-slate-500">Last 14 days · lower is usually better</p>
            </div>
            {hrPoints.length > 0 && <span className="badge bg-pink-50 text-pink-700">Average {Math.round(average(hrPoints.map((p) => p.value)))} bpm</span>}
          </header>
          {hrPoints.length > 1 ? (
            <LineChart points={hrPoints} today={today} />
          ) : (
            <p className="py-14 text-center text-sm text-slate-500">Log your resting heart rate on two or more days to see the trend.</p>
          )}
        </section>

        <section className="card p-5" aria-labelledby="mood-title">
          <h2 id="mood-title" className="card-title">How do you feel today?</h2>
          <p className="text-xs text-slate-500">Your wellness score shows on the dashboard.</p>
          <div className="mt-5 flex items-center gap-4">
            <span className={`grid size-16 shrink-0 place-items-center rounded-2xl ${moodTile}`}>
              <MoodIcon className="size-9" />
            </span>
            <div>
              <p className="text-3xl font-bold text-slate-900">
                {todayLog.mood ?? "–"} <span className="text-lg font-semibold text-slate-400">/ 10</span>
              </p>
              <p className={`text-sm font-medium ${moodTone}`}>{moodLabel}</p>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-10 gap-1.5" role="group" aria-label="Wellness score from 1 to 10">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={n === todayLog.mood}
                onClick={() => saveDay(today, { mood: n })}
                className="h-9 rounded-lg border border-slate-200 text-sm font-semibold text-slate-600 transition hover:border-pink-300 aria-pressed:border-pink-500 aria-pressed:bg-pink-500 aria-pressed:text-white"
              >
                {n}
              </button>
            ))}
          </div>
          <p className="mt-5 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">You enter health numbers by hand for now. Change your goals in Settings → Preferences.</p>
        </section>
      </div>

      <Modal open={logging} onClose={() => setLogging(false)} title="Log health" description="Leave a box empty to clear it.">
        <LogForm today={today} byDate={byDate} onClose={() => setLogging(false)} onSave={saveDay} />
      </Modal>
    </>
  );
}

function CardTitle({ icon: IconComponent, tile, title, note }: { icon: LucideIcon; tile: string; title: string; note: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="flex items-center gap-2 font-semibold text-slate-800">
        <span className={`icon-tile size-8 ${tile}`}>
          <IconComponent className="size-4" />
        </span>
        {title}
      </p>
      <span className="text-xs text-slate-500">{note}</span>
    </div>
  );
}

function Ring({ share, color }: { share: number; color: string }) {
  return (
    <div className="relative size-22 shrink-0">
      <Donut segments={[{ value: Math.min(share, 100), color }]} max={100} thickness={12} round className="absolute inset-0" />
      <p className="absolute inset-0 grid place-content-center text-sm font-bold text-slate-800">{share}%</p>
    </div>
  );
}

/** Seven bars with a dashed goal line. Days that reach the goal are darker. */
function BarChart({ days, today, values, goal, max, done, notDone, format }: {
  days: string[];
  today: string;
  values: (number | null)[];
  goal: number;
  max: number;
  done: string;
  notDone: string;
  format: (value: number) => string;
}) {
  return (
    <div className="mt-6">
      <div className="relative h-44">
        <div className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-dashed border-slate-300" style={{ bottom: `${(goal / max) * 100}%` }}>
          <span className="absolute -top-5 right-0 rounded bg-white px-1 text-[10px] font-medium text-slate-500">Goal {format(goal)}</span>
        </div>
        <div className="grid h-full grid-cols-7 items-end gap-2 sm:gap-4">
          {values.map((value, i) => {
            const label = days[i] === today ? "Today" : formatDate(days[i], "long");
            return value === null ? (
              <span key={days[i]} className="h-1 w-full max-w-11 justify-self-center rounded-full bg-slate-100" title={`${label}: not logged`} />
            ) : (
              <span
                key={days[i]}
                className={`w-full max-w-11 justify-self-center rounded-t-lg ${value >= goal ? done : notDone}`}
                style={{ height: `${Math.min(value / max, 1) * 100}%` }}
                title={`${label}: ${format(value)}`}
              />
            );
          })}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-7 gap-2 text-center text-[11px] text-slate-500 sm:gap-4">
        {days.map((day) => (
          <span key={day} className={day === today ? "font-semibold text-blue-600" : ""}>
            {day === today ? "Today" : formatDate(day, "weekday")}
          </span>
        ))}
      </div>
    </div>
  );
}

function LineChart({ points, today }: { points: { date: string; value: number }[]; today: string }) {
  const w = 640;
  const h = 180;
  const padX = 36;
  const padY = 14;
  const values = points.map((p) => p.value);
  const min = Math.floor(Math.min(...values) - 2);
  const max = Math.ceil(Math.max(...values) + 2);
  const first = points[0].date;
  const span = Math.max(1, (Date.parse(points[points.length - 1].date) - Date.parse(first)) / 86400000);
  const x = (date: string) => padX + ((Date.parse(date) - Date.parse(first)) / 86400000 / span) * (w - padX - 10);
  const y = (v: number) => padY + (1 - (v - min) / (max - min)) * (h - padY * 2);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const lastX = x(points[points.length - 1].date).toFixed(1);
  const area = `${line} L${lastX},${h - padY} L${x(first).toFixed(1)},${h - padY} Z`;
  const ticks = [min, Math.round((min + max) / 2), max];
  const labelled = [points[0], points[Math.floor((points.length - 1) / 2)], points[points.length - 1]];
  const label = (date: string) => (date === today ? "Today" : formatDate(date, "short"));

  return (
    <svg viewBox={`0 0 ${w} ${h + 18}`} className="mt-5 h-auto w-full" role="img" aria-label={`Resting heart rate on ${points.length} days`}>
      <defs>
        <linearGradient id="hr-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ec4899" stopOpacity=".22" />
          <stop offset="1" stopColor="#ec4899" stopOpacity="0" />
        </linearGradient>
      </defs>
      <g fill="#94a3b8" fontSize="11">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padX} x2={w - 10} y1={y(t)} y2={y(t)} stroke="#e2e8f0" strokeDasharray="4 4" />
            <text x={padX - 8} y={y(t) + 4} textAnchor="end">{t}</text>
          </g>
        ))}
        {labelled.map((p, k) => (
          <text key={k} x={x(p.date)} y={h + 12} textAnchor={(["start", "middle", "end"] as const)[k]}>
            {label(p.date)}
          </text>
        ))}
      </g>
      <path d={area} fill="url(#hr-fill)" />
      <path d={line} fill="none" stroke="#ec4899" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => {
        const last = i === points.length - 1;
        return (
          <circle key={p.date} cx={x(p.date)} cy={y(p.value)} r={last ? 5 : 3.5} fill={last ? "#ec4899" : "#fff"} stroke="#ec4899" strokeWidth="2">
            <title>{`${label(p.date)}: ${p.value} bpm`}</title>
          </circle>
        );
      })}
    </svg>
  );
}

function LogForm({ today, byDate, onClose, onSave }: {
  today: string;
  byDate: Map<string, HealthLog>;
  onClose: () => void;
  onSave: (date: string, changes: Changes, message?: string) => Promise<void>;
}) {
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const log = byDate.get(date);
  const sleep = log?.sleep_minutes ?? null;

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const number = (name: string) => (String(form.get(name) ?? "") === "" ? null : Number(form.get(name)));
    const hours = number("sleep_h");
    const minutes = number("sleep_m");
    const water = number("water");
    const changes: Changes = {
      steps: number("steps"),
      sleep_minutes: hours === null && minutes === null ? null : Math.round((hours ?? 0) * 60 + (minutes ?? 0)),
      resting_hr: number("resting_hr"),
      weight_kg: number("weight_kg"),
      water_glasses: water ?? 0,
    };
    setBusy(true);
    await onSave(date, changes, date === today ? "Today's health saved" : `${formatDate(date, "long")} saved`);
    setBusy(false);
    onClose();
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Day" htmlFor="log-date">
        <input id="log-date" type="date" className="input" value={date} max={today} min={addDays(today, -29)} onChange={(e) => e.target.value && setDate(e.target.value)} required />
      </Field>
      {/* Remounts when the day changes, so the boxes show that day's numbers. */}
      <div key={date} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Steps" htmlFor="log-steps">
            <input id="log-steps" name="steps" type="number" min={0} max={200000} className="input" defaultValue={log?.steps ?? ""} />
          </Field>
          <Field label="Resting heart rate (bpm)" htmlFor="log-hr">
            <input id="log-hr" name="resting_hr" type="number" min={20} max={250} className="input" defaultValue={log?.resting_hr ?? ""} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Sleep (hours)" htmlFor="log-sleep-h">
            <input id="log-sleep-h" name="sleep_h" type="number" min={0} max={24} className="input" defaultValue={sleep === null ? "" : Math.floor(sleep / 60)} />
          </Field>
          <Field label="Sleep (minutes)" htmlFor="log-sleep-m">
            <input id="log-sleep-m" name="sleep_m" type="number" min={0} max={59} className="input" defaultValue={sleep === null ? "" : sleep % 60} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Weight (kg)" htmlFor="log-weight">
            <input id="log-weight" name="weight_kg" type="number" min={1} max={500} step={0.1} className="input" defaultValue={log?.weight_kg ?? ""} />
          </Field>
          <Field label="Water (glasses)" htmlFor="log-water">
            <input id="log-water" name="water" type="number" min={0} max={50} className="input" defaultValue={log?.water_glasses ?? 0} />
          </Field>
        </div>
      </div>
      <ModalActions onCancel={onClose} submitLabel="Save" busy={busy} />
    </form>
  );
}
