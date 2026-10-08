"use client";

import { useSyncExternalStore } from "react";

/** True while the screen matches a CSS media query, e.g. useMedia("(min-width: 40rem)"). False until the page has loaded. */
export function useMedia(query: string) {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", notify);
      return () => list.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
