"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { elapsedMs, FOCUS_KEY, loggedHours, readFocus, type FocusState } from "./focus";

// The timer lives in the browser's storage (so it survives a reload and shows in other tabs). When storage is blocked
// (a private window) it is kept in memory and works until the page is closed.
const listeners = new Set<() => void>();
let memory: string | null = null;
let useMemoryOnly = false;

function readRaw(): string | null {
  if (useMemoryOnly) return memory;
  try {
    return localStorage.getItem(FOCUS_KEY);
  } catch {
    useMemoryOnly = true;
    return memory;
  }
}

function writeRaw(value: string | null) {
  memory = value;
  if (!useMemoryOnly) {
    try {
      if (value) localStorage.setItem(FOCUS_KEY, value);
      else localStorage.removeItem(FOCUS_KEY);
    } catch {
      useMemoryOnly = true;
    }
  }
  listeners.forEach((l) => l());
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const onStorage = (e: StorageEvent) => {
    if (e.key === FOCUS_KEY || e.key === null) onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** The current second while `active`, so a running timer re-renders once a second (and nothing re-renders when it is off). */
function useSecond(active: boolean) {
  const sub = useCallback(
    (onChange: () => void) => {
      if (!active) return () => {};
      const tick = setInterval(onChange, 1000);
      return () => clearInterval(tick);
    },
    [active],
  );
  return useSyncExternalStore(sub, () => Math.floor(Date.now() / 1000) * 1000, () => 0);
}

/**
 * The focus timer: a stopwatch that survives a reload (and shows in other tabs). `stop()` returns the hours to log
 * (to the nearest quarter hour) and what it was about; `cancel()` forgets it.
 */
export function useFocus() {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  const state: FocusState | null = useMemo(() => readFocus(raw), [raw]);
  const now = useSecond(state !== null);

  const start = useCallback((choice = "") => {
    writeRaw(JSON.stringify({ startedAt: Date.now(), choice } satisfies FocusState));
  }, []);

  const stop = useCallback(() => {
    const current = readFocus(readRaw());
    if (!current) return null;
    const result = { hours: loggedHours(Date.now() - current.startedAt), choice: current.choice };
    writeRaw(null);
    return result;
  }, []);

  const cancel = useCallback(() => writeRaw(null), []);

  return { running: state !== null, choice: state?.choice ?? "", elapsed: state ? elapsedMs(state, now || state.startedAt) : 0, start, stop, cancel };
}
