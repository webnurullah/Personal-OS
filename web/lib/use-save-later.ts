"use client";

import { useEffect, useRef } from "react";

/**
 * Waits until typing stops before saving. Anything still waiting is saved at once when you leave the page,
 * switch tab or close the browser (not only after the wait), so the last edit is not lost.
 */
export function useSaveLater(delay = 700) {
  const pending = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>; save: () => unknown }>());

  useEffect(() => {
    const waiting = pending.current;
    const flush = () => {
      waiting.forEach(({ timer, save }) => {
        clearTimeout(timer);
        save();
      });
      waiting.clear();
    };
    // "pagehide" covers closing the tab and leaving the page; "hidden" covers a phone going to the background.
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
      flush();
    };
  }, []);

  const later = (key: string, save: () => unknown) => {
    const waiting = pending.current;
    const old = waiting.get(key);
    if (old) clearTimeout(old.timer);
    const timer = setTimeout(() => {
      waiting.delete(key);
      save();
    }, delay);
    waiting.set(key, { timer, save });
  };
  /** Saves what is waiting under `key` now (nothing happens when nothing is waiting). Gives back what the save returns. */
  later.flush = (key: string) => {
    const waiting = pending.current;
    const entry = waiting.get(key);
    if (!entry) return undefined;
    clearTimeout(entry.timer);
    waiting.delete(key);
    return entry.save();
  };
  return later;
}
