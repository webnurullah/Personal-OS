"use client";

import { useState } from "react";
import useSWR from "swr";
import { api, errorMessage, refresh } from "@/lib/api";
import { clock, MAX_SESSION_SECONDS, type ProjectTimeState } from "@/lib/project-time";
import { useSecond } from "@/lib/use-second";
import { useFeedback } from "@/components/ui/feedback";

/** Where the time of a library item (a certificate course) is kept. It counts on the course the item is linked to as well. */
export const resourceTimePath = (id: string) => `/resources/${id}/time`;

/** Starts the timer of a library item and reloads what shows the time. */
export async function startResourceTimer(id: string) {
  const next = await api<ProjectTimeState>(resourceTimePath(id), { method: "POST", body: { action: "start" } });
  void refresh("/resources", "/project-time", "/learning", "/courses", "/timer", "/habits");
  return next;
}

/**
 * The timer of one certificate course in the library: the time spent, and the Resume / Pause button.
 * Other timers keep running.
 */
export function useResourceTimer(id: string, enabled = true) {
  const { toast } = useFeedback();
  const [skew, setSkew] = useState(0);
  const [busy, setBusy] = useState(false);
  const { data, error, mutate } = useSWR<ProjectTimeState>(enabled ? resourceTimePath(id) : null, { onSuccess: (d) => setSkew(new Date(d.now).getTime() - Date.now()) });

  const here = Boolean(data?.running && data.running.kind === "resource" && data.running.project_id === id);
  const second = useSecond(here);
  const sinceStart = here && data?.running ? Math.min(MAX_SESSION_SECONDS, Math.max(0, Math.floor((second + skew - new Date(data.running.started_at).getTime()) / 1000))) : 0;
  const total = (data?.closed_seconds ?? 0) + sinceStart;

  const press = async (action: "start" | "pause") => {
    setBusy(true);
    try {
      const next = await api<ProjectTimeState>(resourceTimePath(id), { method: "POST", body: { action } });
      setSkew(new Date(next.now).getTime() - Date.now());
      await mutate(next, { revalidate: false });
      void refresh("/project-time", "/learning", "/courses", "/timer", "/habits");
      toast(action === "start" ? "Timer started" : `Paused at ${clock(next.closed_seconds)}`);
    } catch (e) {
      toast(errorMessage(e), "error");
      void mutate();
    } finally {
      setBusy(false);
    }
  };

  return { here, total, busy, press, loaded: Boolean(data), failed: Boolean(error && !data), hasTime: total > 0 };
}

/** The clock line shown on a started certificate course. */
export function ResourceClock({ timer }: { timer: ReturnType<typeof useResourceTimer> }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 text-sm text-slate-500">
      <span className="inline-flex items-center gap-1.5 text-base font-bold tabular-nums text-slate-900" role="timer" aria-label="Time spent on this course">
        {timer.loaded ? clock(timer.total) : timer.failed ? "–:––:––" : "0:00:00"}
        {timer.here && <span className="size-2 shrink-0 animate-pulse rounded-full bg-emerald-500" title="Running" aria-hidden />}
      </span>
      <span>{timer.here ? "Running" : "Paused"}</span>
    </p>
  );
}

