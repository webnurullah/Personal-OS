"use client";

import { useCallback, useSyncExternalStore } from "react";

/** The current second (ms, rounded down) while `active`, so a running clock re-renders once a second (and nothing re-renders when it is off). */
export function useSecond(active: boolean) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!active) return () => {};
      const tick = setInterval(onChange, 1000);
      return () => clearInterval(tick);
    },
    [active],
  );
  return useSyncExternalStore(subscribe, () => Math.floor(Date.now() / 1000) * 1000, () => 0);
}
