// Learning → focus timer: a stopwatch kept in the browser (so it survives a reload and shows in every tab). When it is
// stopped, the time becomes the hours of a study session. Plain functions: the hook that stores it is lib/use-focus.ts.

export const FOCUS_KEY = "pos-focus";
export type FocusState = { startedAt: number; choice: string };

/** Reads what was stored; anything that is not a proper timer is ignored (null). */
export function readFocus(raw: string | null): FocusState | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { startedAt?: unknown; choice?: unknown };
    if (typeof value.startedAt !== "number" || !Number.isFinite(value.startedAt) || value.startedAt <= 0) return null;
    return { startedAt: value.startedAt, choice: typeof value.choice === "string" && /^(t|r):[0-9a-f-]{36}$/i.test(value.choice) ? value.choice : "" };
  } catch {
    return null;
  }
}

/** Milliseconds on the clock (never below 0, also when the computer's clock was set back). */
export const elapsedMs = (state: FocusState, now: number) => Math.max(0, now - state.startedAt);

/** "12:03" under an hour, "1:02:03" after. */
export function clock(ms: number) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`;
}

/** The hours of a session for the time on the clock: to the nearest quarter hour, at least 15 minutes, at most 24 hours. */
export function loggedHours(ms: number) {
  const hours = Math.round((ms / 3_600_000) * 4) / 4;
  return Math.min(24, Math.max(0.25, hours));
}
