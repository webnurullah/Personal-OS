// Start loading a page's data before it is opened: when the pointer is over its menu link
// (or a finger touches it), and for every page shortly after the app opens.
import { cacheMutate } from "./cache";
import { fetcher } from "./api";

// The SWR keys each page asks for first (must match the keys in the page views).
const PAGE_DATA: Record<string, string[]> = {
  "/": ["/dashboard"],
  "/tasks": ["/tasks", "/categories", "/projects?lite=1"],
  "/projects": ["/projects"],
  "/archive": ["/archive"],
  "/goals": ["/goals"],
  "/habits": ["/habits?days=7"],
  "/learning": ["/learning/week"],
  "/learning/library": ["/resources", "/courses"],
  "/finance": ["/finance"],
  "/health": ["/health?days=30"],
  "/notes": ["/notes", "/reminders"],
  "/jobs": ["/jobs", "/profile", "/companies"],
  "/jobs/companies": ["/companies", "/jobs"],
};

const lastLoaded = new Map<string, number>();

function load(key: string) {
  // At most once every 15 seconds per key, so moving the mouse over the menu stays cheap.
  if (Date.now() - (lastLoaded.get(key) ?? 0) < 15_000) return;
  lastLoaded.set(key, Date.now());
  cacheMutate(key, fetcher(key), { revalidate: false }).catch(() => lastLoaded.delete(key));
}

export function prefetchPage(href: string) {
  for (const key of PAGE_DATA[href] ?? []) load(key);
}

/** Every page's data, one request after another so the page you are on is not slowed down. */
export async function prefetchAll() {
  for (const key of new Set(Object.values(PAGE_DATA).flat())) {
    load(key);
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}
