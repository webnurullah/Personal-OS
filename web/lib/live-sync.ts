// Real-time sync: which screens to reload when a table changes (on this or another device), and a batcher that merges a burst of changes into one reload.
// Plain functions, so they can be tested. The component that listens is components/shell/live-sync.tsx.

/** Table → the SWR keys (API paths) that show its rows. `refresh()` always adds the dashboard, the bell, the projects and the Archive. */
export const TABLE_PREFIXES: Record<string, string[]> = {
  tasks: ["/tasks", "/events", "/goals", "/courses", "/learning", "/search"],
  events: ["/events"],
  projects: ["/projects", "/project-time"],
  project_time: ["/timer", "/project-time", "/projects", "/courses", "/learning", "/habits"],
  course_time: ["/timer", "/project-time", "/courses", "/learning", "/resources", "/habits"],
  courses: ["/courses", "/learning", "/resources"],
  course_units: ["/courses", "/learning", "/resources"],
  course_topics: ["/courses", "/learning"],
  study_blocks: ["/learning", "/courses"],
  study_weeks: ["/learning", "/courses"],
  learning_resources: ["/resources", "/courses", "/learning"],
  habits: ["/habits"],
  habit_logs: ["/habits"],
  habit_sources: ["/habits"],
  goals: ["/goals", "/tasks"],
  goal_milestones: ["/goals", "/tasks"],
  notes: ["/notes"],
  bills: ["/finance"],
  transactions: ["/finance"],
  budget_categories: ["/finance"],
  health_logs: ["/health"],
  reminders: ["/reminders"],
  job_applications: ["/jobs", "/companies"],
  companies: ["/companies", "/jobs"],
  categories: ["/categories", "/tasks", "/goals", "/notes"],
  archive_items: ["/archive"],
  profiles: ["/profile"],
};

/** The tables the app listens to. */
export const LIVE_TABLES = Object.keys(TABLE_PREFIXES);

/** The keys to reload for a set of changed tables (each once). A table the map does not know reloads nothing extra. */
export function prefixesFor(tables: Iterable<string>) {
  const out = new Set<string>();
  for (const table of tables) for (const prefix of TABLE_PREFIXES[table] ?? []) out.add(prefix);
  return [...out];
}

export type Timers = { set: (fn: () => void, ms: number) => unknown; clear: (id: unknown) => void };
const realTimers: Timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>) };

/**
 * Collects changed tables and, `delay` ms after the last one, calls `run` once with the keys to reload. While `busy()` says so
 * (the person is typing in a field that must not be reloaded) the reload waits and tries again every `retry` ms.
 */
export function createBatcher(run: (prefixes: string[]) => void, options: { delay?: number; retry?: number; busy?: () => boolean; timers?: Timers } = {}) {
  const { delay = 400, retry = 2000, busy = () => false, timers = realTimers } = options;
  const pending = new Set<string>();
  let timer: unknown = null;

  const flush = () => {
    timer = null;
    if (pending.size === 0) return;
    if (busy()) {
      timer = timers.set(flush, retry);
      return;
    }
    const prefixes = prefixesFor(pending);
    pending.clear();
    if (prefixes.length) run(prefixes);
  };

  return {
    push(table: string) {
      pending.add(table);
      if (timer !== null) timers.clear(timer);
      timer = timers.set(flush, delay);
    },
    /** Stops a waiting reload (when the page goes away). */
    cancel() {
      if (timer !== null) timers.clear(timer);
      timer = null;
      pending.clear();
    },
  };
}
