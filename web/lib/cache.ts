// Keeps the last answers from the API in this browser, so opening or reloading the app shows
// your data at once (no loading skeleton) while fresh data loads from the server in the background.
import { mutate as defaultMutate, type Cache, type ScopedMutator, type State } from "swr";

const STORAGE_KEY = "pos-cache-v1";
// Bigger than this is not worth storing (the browser allows about 5 MB per site).
const MAX_CHARS = 2_000_000;

let current: Map<string, State> | undefined;
let boundMutate: ScopedMutator = defaultMutate;

/** Called once by the app shell with the mutate function of the cache below. */
export function bindMutate(mutate: ScopedMutator) {
  boundMutate = mutate;
}

/** SWR's mutate for the app's cache (the global one from "swr" points at a different, empty cache). */
export const cacheMutate: ScopedMutator = ((...args: Parameters<ScopedMutator>) => boundMutate(...args)) as ScopedMutator;

function read(): [string, State][] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as [string, State][]) : [];
  } catch {
    return [];
  }
}

function save() {
  if (!current) return;
  try {
    // Only finished answers: no errors and no "loading" flags.
    const entries = [...current].filter(([, state]) => state.data !== undefined).map(([key, state]) => [key, { data: state.data }]);
    const text = JSON.stringify(entries);
    if (text.length < MAX_CHARS) localStorage.setItem(STORAGE_KEY, text);
  } catch {
    // Storage full or blocked (private window): the app simply loads from the server.
  }
}

/** SWR cache provider: starts from what this browser saved last time and saves again when the tab is hidden or closed. */
export function persistentCache(): Cache {
  current = new Map(typeof window === "undefined" ? [] : read());
  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", save);
    document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && save());
  }
  return current as Cache;
}

/** Forget the saved data (on sign-out, or when another person signs in on this browser). */
export function clearCache() {
  current?.clear();
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing saved.
  }
}
