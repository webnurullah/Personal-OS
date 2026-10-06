// Start loading a page's data when the pointer is over its menu link (or a finger touches it),
// so the data is often there by the time the page opens.
import { preload } from "swr";
import { fetcher } from "./api";

// The SWR keys each page asks for first (must match the keys in the page views).
const PAGE_DATA: Record<string, string[]> = {
  "/": ["/dashboard"],
  "/tasks": ["/tasks"],
  "/goals": ["/goals"],
  "/habits": ["/habits?days=7"],
  "/learning": ["/learning/week"],
  "/finance": ["/finance"],
  "/health": ["/health?days=30"],
  "/notes": ["/notes", "/reminders"],
};

const lastLoaded = new Map<string, number>();

export function prefetchPage(href: string) {
  for (const key of PAGE_DATA[href] ?? []) {
    // At most once every 15 seconds per page, so moving the mouse over the menu stays cheap.
    if (Date.now() - (lastLoaded.get(key) ?? 0) < 15_000) continue;
    lastLoaded.set(key, Date.now());
    Promise.resolve(preload(key, fetcher)).catch(() => lastLoaded.delete(key));
  }
}
