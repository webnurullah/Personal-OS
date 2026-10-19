"use client";

import { useState } from "react";
import useSWR from "swr";
import { Pause, Play } from "lucide-react";
import { api, errorMessage, refresh } from "@/lib/api";
import { clock, MAX_SESSION_SECONDS, spent, type ProjectTimeState, type TimeKind } from "@/lib/project-time";
import { useSecond } from "@/lib/use-second";
import { useFeedback } from "@/components/ui/feedback";

/**
 * "Time spent" on a project page or a course page: a clock that counts up while you work on it. Press Start, and Pause when you stop; pressing Start
 * again carries on from the time already spent. The timer lives on the server, so it keeps running if you close the page.
 * Other timers keep running: several can count at the same time (each also shows as a circle on every page).
 */
export function ProjectTimer({ kind = "project", projectId, archived = false }: { kind?: TimeKind; projectId: string; archived?: boolean }) {
  const { toast } = useFeedback();
  // How far this device's clock is from the server's, so a wrong clock on the phone does not show wrong seconds.
  const [skew, setSkew] = useState(0);
  const [busy, setBusy] = useState(false);
  const base = `/${kind === "course" ? "courses" : "projects"}/${projectId}/time`;
  const { data, error, mutate } = useSWR<ProjectTimeState>(base, { onSuccess: (d) => setSkew(new Date(d.now).getTime() - Date.now()) });

  const here = data?.running?.project_id === projectId && data.running.kind === kind;
  const second = useSecond(Boolean(data?.running));
  const sinceStart = data?.running ? Math.min(MAX_SESSION_SECONDS, Math.max(0, Math.floor((second + skew - new Date(data.running.started_at).getTime()) / 1000))) : 0;
  const total = (data?.closed_seconds ?? 0) + (here ? sinceStart : 0);
  const today = (data?.today_closed_seconds ?? 0) + (here && data?.running?.started_today ? sinceStart : 0);

  const press = async (action: "start" | "pause") => {
    setBusy(true);
    try {
      const next = await api<ProjectTimeState>(base, { method: "POST", body: { action } });
      setSkew(new Date(next.now).getTime() - Date.now());
      await mutate(next, { revalidate: false });
      void refresh("/project-time", "/timer");
      toast(action === "start" ? "Timer started" : `Paused at ${clock(next.closed_seconds)}`);
    } catch (e) {
      toast(errorMessage(e), "error");
      void mutate();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card p-5" aria-labelledby="timer-title">
      <p id="timer-title" className="text-xs font-medium text-slate-500">Time spent</p>
      <p className="mt-0.5 flex items-center gap-2 text-2xl font-bold tabular-nums text-slate-900" role="timer" aria-label={`Time spent on this ${kind}`}>
        {data ? clock(total) : error ? "–:––:––" : "0:00:00"}
        {here && <span className="size-2.5 shrink-0 animate-pulse rounded-full bg-emerald-500" title="Running" aria-hidden />}
      </p>
      <p className="mt-2 text-sm text-slate-500">
        {error && !data ? "The time could not be loaded." : here ? `Running · today ${spent(today)}` : `Paused · today ${spent(today)}`}
      </p>
      <div className="mt-3">
        {here ? (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => press("pause")} disabled={busy}>
            <Pause className="size-4" />
            Pause
          </button>
        ) : (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => press("start")} disabled={busy || archived || !data} title={archived ? "Restore the project to keep time on it" : undefined}>
            <Play className="size-4" />
            {total > 0 ? "Continue" : "Start"}
          </button>
        )}
      </div>
    </section>
  );
}
