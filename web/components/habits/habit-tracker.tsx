"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Flame, Pencil, Plus, Repeat, Trash2 } from "lucide-react";
import { api, errorMessage, refresh } from "@/lib/api";
import { colorOf } from "@/lib/colors";
import { formatDate } from "@/lib/dates";
import type { Habit, HabitsResponse } from "@/lib/types";
import { Progress } from "../ui/charts";
import { useFeedback } from "../ui/feedback";
import { Icon } from "../ui/icon";
import { EmptyState } from "../ui/states";

/** The key of the habits answer this card reads (the Habits page and the Dashboard share it). */
export const HABITS_KEY = "/habits?days=7";

type Mutate = (data: HabitsResponse, options: { revalidate: boolean }) => Promise<unknown>;

/**
 * The "Last 7 days" card: every habit with a dot for each of the last seven days (tap to tick or untick), its streak and its
 * share of this week. Used on the Habits page (with edit and delete) and at the top of the Dashboard (tick only).
 * On a phone the table is wider than the screen: it starts with today's column in view, and the habit names stay put on the left.
 */
export function HabitTracker({ data, mutate, onEdit, onDelete, onNew, link, compact = false, className = "" }: {
  data: HabitsResponse;
  mutate: Mutate;
  onEdit?: (habit: Habit) => void;
  onDelete?: (habit: Habit) => void;
  /** The "New habit" button of the empty card; without it the empty card links to the Habits page. */
  onNew?: () => void;
  /** An extra link in the header, such as "View All". */
  link?: { href: string; label: string };
  /** A smaller card (the Dashboard): tighter rows and smaller dots, and without the line that tells how to tick a day. */
  compact?: boolean;
  className?: string;
}) {
  const { toast } = useFeedback();
  const scroller = useRef<HTMLDivElement>(null);
  const { days } = data;
  const habitCount = data.items.length;
  useEffect(() => {
    const box = scroller.current;
    const today = box?.querySelector<HTMLElement>("[data-today]");
    if (box && today) box.scrollLeft = Math.max(0, today.offsetLeft + today.offsetWidth - box.clientWidth + 24);
  }, [habitCount]);

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

  const actions = (habit: Habit): ReactNode =>
    (onEdit || onDelete) && (
      <>
        {onEdit && (
          <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => onEdit(habit)} aria-label={`Edit ${habit.name}`}>
            <Pencil className="size-4" />
          </button>
        )}
        {onDelete && (
          <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => onDelete(habit)} aria-label={`Delete ${habit.name}`}>
            <Trash2 className="size-4" />
          </button>
        )}
      </>
    );

  return (
    <section className={`card ${compact ? "p-4" : "p-5"} ${className}`} aria-labelledby="tracker-title">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="tracker-title" className="card-title">Last 7 days</h2>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
          {!compact && "Tap a day to tick or untick it. Streaks update straight away."}
          {link && (
            <Link href={link.href} className="link-more">
              {link.label} <ArrowRight className="size-3.5" />
            </Link>
          )}
        </p>
      </header>
      {data.items.length ? (
        <div ref={scroller} className={`relative overflow-x-auto ${compact ? "mt-2" : "mt-4"}`}>
          <table className={`w-full text-sm ${compact ? "min-w-[600px]" : "min-w-[760px]"}`}>
            <thead>
              <tr className="text-xs text-slate-500">
                <th className={`sticky left-0 z-10 bg-white text-left font-medium ${compact ? "pb-1.5" : "pb-3"}`}>Habit</th>
                {days.map((day, i) => {
                  const isToday = i === days.length - 1;
                  return (
                    <th key={day} data-today={isToday ? "" : undefined} className={`text-center font-medium ${compact ? "pb-1.5" : "pb-3"}`}>
                      <span className={`block ${compact ? "text-[11px]" : ""} ${isToday ? "text-blue-600" : ""}`}>{isToday ? "Today" : formatDate(day, "weekday")}</span>
                      <span className={`mt-0.5 inline-grid place-items-center rounded-full ${compact ? "size-5 text-[10px]" : "size-6 text-[11px]"} ${isToday ? "bg-blue-600 text-white" : "text-slate-400"}`}>{Number(day.slice(8))}</span>
                    </th>
                  );
                })}
                <th className={`text-center font-medium ${compact ? "pb-1.5" : "pb-3"}`}>Streak</th>
                <th className={`pl-4 text-left font-medium ${compact ? "pb-1.5" : "pb-3"}`}>This week</th>
                <th className={compact ? "pb-1.5" : "pb-3"} />
              </tr>
            </thead>
            <tbody>
              {data.items.map((habit) => (
                <tr key={habit.id} className="group border-t border-slate-100">
                  <td className={`sticky left-0 z-10 bg-white pr-3 sm:static sm:w-auto sm:pr-4 ${compact ? "w-36 py-1.5" : "w-40 py-3"}`}>
                    <div className="flex items-center gap-3">
                      {!compact && (
                        <span className={`icon-tile max-sm:hidden ${colorOf(habit.color).tile}`}>
                          <Icon name={habit.icon} className="size-4.5" />
                        </span>
                      )}
                      <div className="min-w-0">
                        {compact ? (
                          <p className="flex items-center gap-1.5 text-[13px]">
                            <Icon name={habit.icon} className={`size-3.5 shrink-0 ${colorOf(habit.color).text}`} />
                            <span className="max-w-56 truncate font-medium text-slate-800" title={habit.name}>{habit.name}</span>
                            {habit.goal_text && <span className="hidden shrink-0 text-xs text-slate-400 lg:inline">· {habit.goal_text}</span>}
                          </p>
                        ) : (
                          <>
                            <p className="font-medium text-slate-800">{habit.name}</p>
                            {habit.goal_text && <p className="text-xs text-slate-500">{habit.goal_text}</p>}
                          </>
                        )}
                        <span className="-ml-2 mt-1 flex sm:hidden">{actions(habit)}</span>
                      </div>
                    </div>
                  </td>
                  {habit.done.map((done, i) => (
                    <td key={days[i]} className="text-center">
                      <button
                        type="button"
                        className={`habit-dot ${compact ? "habit-dot-md" : "habit-dot-lg"} ${i === days.length - 1 ? "is-today" : ""}`}
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
                    <div className={`flex items-center gap-2 ${compact ? "w-28" : "w-36"}`}>
                      <Progress value={habit.share} fill="bg-emerald-500" className="h-1.5 flex-1" />
                      <span className="w-9 text-right text-xs font-semibold text-slate-600">{habit.share}%</span>
                    </div>
                  </td>
                  <td className={`text-right ${compact ? "w-0" : "w-20"}`}>
                    <span className="reveal hidden sm:inline-flex">{actions(habit)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState icon={Repeat} title="No habits yet" text="Start with one small habit. You can always add more.">
          {onNew ? (
            <button type="button" className="btn btn-primary btn-sm" onClick={onNew}>
              <Plus className="size-4" /> New habit
            </button>
          ) : (
            <Link href="/habits?new=1" className="btn btn-primary btn-sm">
              <Plus className="size-4" /> New habit
            </Link>
          )}
        </EmptyState>
      )}
    </section>
  );
}
