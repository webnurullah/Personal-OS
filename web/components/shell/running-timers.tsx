"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { api, errorMessage, refresh } from "@/lib/api";
import { clock, MAX_SESSION_SECONDS, spent, type ProjectTimeState } from "@/lib/project-time";
import { useSecond } from "@/lib/use-second";
import { useFeedback } from "@/components/ui/feedback";

/** A timer as the server lists it (see runningTimers in lib/server/project-time.ts). */
type Timer = { key: string; kind: "project" | "course" | "resource"; id: string; name: string; module: "Project" | "Course" | "Certificate"; href: string; started_at: string; closed_seconds: number };
type Running = { now: string; timers: Timer[] };
/** A timer that was running and is now paused: kept on screen so it can be started again in one tap, until it is hidden. */
type Paused = Timer & { total: number };

const COLOR: Record<Timer["module"], string> = { Project: "#d97706", Course: "#2563eb", Certificate: "#0d9488" };
const GOAL_SECONDS = 2 * 3600;
const R = 24;
const C = 2 * Math.PI * R;

const base = (t: Pick<Timer, "kind" | "id">) => `/${t.kind === "project" ? "projects" : t.kind === "course" ? "courses" : "resources"}/${t.id}/time`;
const without = <V,>(map: Record<string, V>, key: string) => Object.fromEntries(Object.entries(map).filter(([k]) => k !== key)) as Record<string, V>;
const short = (s: number) => {
  const n = Math.floor(s);
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  return h ? `${h}h${String(m).padStart(2, "0")}` : m ? `${m}m` : `${n}s`;
};

/**
 * Every running timer as a round circle in the bottom row, to the left of the AI circle, on every page. Tap a circle for its card: module, name, clock and Pause / Start.
 * A timer you pause stays as a paused circle (× hides it) so it can be started again quickly.
 */
export function RunningTimers() {
  const { toast } = useFeedback();
  const [skew, setSkew] = useState(0);
  const [paused, setPaused] = useState<Record<string, Paused>>({});
  const [hidden, setHidden] = useState<Record<string, true>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const last = useRef<Timer[]>([]);

  const { data, mutate } = useSWR<Running>("/timer/running", {
    revalidateOnFocus: true,
    refreshInterval: 60_000,
    onSuccess: (d) => {
      const now = new Date(d.now).getTime();
      setSkew(now - Date.now());
      // A timer that was running and is gone now was paused (here, on its own page or on another device): keep it as a paused circle.
      const list = d.timers ?? [];
      const keys = new Set(list.map((t) => t.key));
      const gone = last.current.filter((t) => !keys.has(t.key));
      if (gone.length) {
        setPaused((p) => {
          const next = { ...p };
          for (const t of gone) next[t.key] = { ...t, total: t.closed_seconds + Math.min(MAX_SESSION_SECONDS, Math.max(0, Math.floor((now - new Date(t.started_at).getTime()) / 1000))) };
          return next;
        });
      }
      last.current = list;
      // A hidden circle comes back when its timer runs again.
      setHidden((h) => (list.some((t) => h[t.key]) ? Object.fromEntries(Object.entries(h).filter(([k]) => !keys.has(k))) as Record<string, true> : h));
    },
  });

  const running = data?.timers ?? [];
  const second = useSecond(running.length > 0);
  const runningKeys = new Set(running.map((t) => t.key));
  const elapsed = (t: Timer) => Math.min(MAX_SESSION_SECONDS, Math.max(0, Math.floor((second + skew - new Date(t.started_at).getTime()) / 1000)));
  const circles: { timer: Timer; isRunning: boolean; total: number }[] = [
    ...running.map((t) => ({ timer: t, isRunning: true, total: t.closed_seconds + elapsed(t) })),
    ...Object.values(paused).filter((p) => !runningKeys.has(p.key)).map((p) => ({ timer: p as Timer, isRunning: false, total: p.total })),
  ].filter((c) => c.isRunning || !hidden[c.timer.key]);

  if (circles.length === 0) return null;

  const press = async (t: Timer, action: "start" | "pause", total: number) => {
    setBusy(t.key);
    try {
      const next = await api<ProjectTimeState>(base(t), { method: "POST", body: { action } });
      if (action === "pause") setPaused((p) => ({ ...p, [t.key]: { ...t, total: next.closed_seconds || total } }));
      else {
        setPaused((p) => without(p, t.key));
        setHidden((h) => without(h, t.key));
      }
      void refresh("/timer", "/project-time", "/learning", "/courses", "/projects", "/resources");
      await mutate();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed bottom-4 right-[4.75rem] z-30 flex flex-row-reverse items-center gap-3 sm:bottom-5 sm:right-[5.25rem]" aria-live="polite">
      {circles.map(({ timer: t, isRunning, total }) => {
        const color = COLOR[t.module];
        const isOpen = open === t.key;
        return (
          <div key={t.key} className="relative">
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : t.key)}
              aria-expanded={isOpen}
              aria-label={`${t.module} ${t.name}, ${isRunning ? "running" : "paused"}, ${clock(total)}`}
              className="relative grid size-13 shrink-0 place-items-center rounded-full bg-white shadow-lg shadow-slate-900/20 ring-1 ring-slate-200 transition hover:scale-105 focus-visible:outline-2 focus-visible:outline-blue-500"
            >
              <svg viewBox="0 0 56 56" className="absolute inset-0 size-full -rotate-90" aria-hidden>
                <circle cx="28" cy="28" r={R} fill="none" stroke="#e2e8f0" strokeWidth="4" />
                <circle cx="28" cy="28" r={R} fill="none" stroke={isRunning ? color : "#94a3b8"} strokeWidth="4" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - Math.min(1, total / GOAL_SECONDS))} />
              </svg>
              <span className="relative text-[11px] font-bold tabular-nums tracking-tight text-slate-900">{short(total)}</span>
              {isRunning && <span className="absolute right-0.5 top-0.5 size-2.5 animate-pulse rounded-full border-2 border-white bg-emerald-500" aria-hidden />}
            </button>
            {isOpen && (
              <div className="fixed bottom-[5rem] right-4 w-[min(17.5rem,calc(100vw-2rem))] rounded-2xl bg-white p-3.5 shadow-lg shadow-slate-900/20 ring-1 ring-slate-200 sm:bottom-[5.75rem] sm:right-5">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color }}>
                  <span className="size-2 rounded-full" style={{ background: color }} aria-hidden />
                  {t.module}
                </p>
                <p className="mt-1 break-words text-[15px] font-semibold leading-snug text-slate-900">
                  <Link href={t.href} className="hover:underline" onClick={() => setOpen(null)}>{t.name}</Link>
                </p>
                <p className="mt-1 text-[28px] font-bold leading-none tabular-nums text-slate-900" role="timer" aria-label={`Time spent on ${t.name}`}>{clock(total)}</p>
                <p className="mb-3 mt-1 text-xs text-slate-500">{isRunning ? "Counting now" : "Paused"} · the ring fills toward {spent(GOAL_SECONDS)} a day</p>
                <div className="flex gap-2">
                  {isRunning ? (
                    <button type="button" className="btn btn-secondary btn-sm flex-1 justify-center" disabled={busy === t.key} onClick={() => press(t, "pause", total)}>Pause</button>
                  ) : (
                    <button type="button" className="btn btn-primary btn-sm flex-1 justify-center" disabled={busy === t.key} onClick={() => press(t, "start", total)}>Start</button>
                  )}
                  {!isRunning && (
                    <button type="button" className="btn btn-ghost btn-sm" aria-label={`Hide ${t.name}`} onClick={() => setHidden((h) => ({ ...h, [t.key]: true }))}>×</button>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
