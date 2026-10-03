import type { Currency, TimeFormat } from "./types";

/** 140000 → "৳1,40,000" (Bangladeshi lakh grouping). Hidden amounts show "৳ ••••". */
export function formatMoney(amount: number, currency: Currency = "BDT", hidden = false) {
  const symbol = currency === "USD" ? "$" : "৳";
  if (hidden) return `${symbol} ••••`;
  const whole = Math.abs(Math.round(amount)).toLocaleString(currency === "USD" ? "en-US" : "en-IN");
  return `${amount < 0 ? "−" : ""}${symbol}${whole}`;
}

/** 2.5 → "2h 30m" */
export function hm(hours: number) {
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** 7.5 → "7.5", 7 → "7" */
export const num = (n: number) => String(Math.round(n * 10) / 10);
export const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);
export const count = (n: number) => Math.round(n).toLocaleString("en-US");
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** "13:30" → "1:30 PM" (12-hour) or "13:30" (24-hour) */
export function formatTime(hhmm: string, format: TimeFormat = "12h") {
  const h = Number(hhmm.slice(0, 2));
  const m = hhmm.slice(3, 5);
  if (format === "24h") return `${hhmm.slice(0, 2)}:${m}`;
  return `${h % 12 || 12}:${m} ${h < 12 ? "AM" : "PM"}`;
}

/** Compact time for small calendar chips: "7am", "7:30pm" or "19:30". */
export function shortTime(hhmm: string, format: TimeFormat = "12h") {
  if (format === "24h") return hhmm.slice(0, 5);
  const h = Number(hhmm.slice(0, 2));
  const m = hhmm.slice(3, 5);
  return `${h % 12 || 12}${m === "00" ? "" : `:${m}`}${h < 12 ? "am" : "pm"}`;
}

export function greeting(now = new Date()) {
  const hour = now.getHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

/** First line of a person's name, for greetings. */
export const firstName = (fullName: string) => fullName.trim().split(/\s+/)[0] || "";
