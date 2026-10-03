import type { ColorName } from "./types";

type Palette = {
  /** Small label: "Work", "Finance" … */
  badge: string;
  /** Square icon background + icon colour */
  tile: string;
  /** Small round dot */
  dot: string;
  /** Progress bar fill */
  bar: string;
  /** Lighter bar (e.g. days that missed a goal) */
  barSoft: string;
  /** Coloured text */
  text: string;
  /** Note card background + border */
  note: string;
  /** Soft background only */
  soft: string;
  /** Colour for SVG charts */
  hex: string;
};

// Every class is written out in full so Tailwind includes it in the CSS.
export const COLORS: Record<ColorName, Palette> = {
  white: { badge: "bg-slate-100 text-slate-600", tile: "bg-slate-100 text-slate-600", dot: "bg-slate-300", bar: "bg-slate-400", barSoft: "bg-slate-200", text: "text-slate-600", note: "border-slate-200 bg-white", soft: "bg-white", hex: "#cbd5e1" },
  slate: { badge: "bg-slate-100 text-slate-700", tile: "bg-slate-100 text-slate-600", dot: "bg-slate-500", bar: "bg-slate-500", barSoft: "bg-slate-200", text: "text-slate-600", note: "border-slate-200 bg-slate-50", soft: "bg-slate-50", hex: "#64748b" },
  blue: { badge: "bg-blue-50 text-blue-700", tile: "bg-blue-50 text-blue-600", dot: "bg-blue-500", bar: "bg-blue-500", barSoft: "bg-blue-200", text: "text-blue-600", note: "border-blue-200/70 bg-blue-50", soft: "bg-blue-50", hex: "#3b82f6" },
  sky: { badge: "bg-sky-50 text-sky-700", tile: "bg-sky-50 text-sky-600", dot: "bg-sky-500", bar: "bg-sky-500", barSoft: "bg-sky-200", text: "text-sky-600", note: "border-sky-200/70 bg-sky-50", soft: "bg-sky-50", hex: "#0ea5e9" },
  cyan: { badge: "bg-cyan-50 text-cyan-700", tile: "bg-cyan-50 text-cyan-600", dot: "bg-cyan-500", bar: "bg-cyan-500", barSoft: "bg-cyan-200", text: "text-cyan-600", note: "border-cyan-200/70 bg-cyan-50", soft: "bg-cyan-50", hex: "#06b6d4" },
  teal: { badge: "bg-teal-50 text-teal-700", tile: "bg-teal-50 text-teal-600", dot: "bg-teal-500", bar: "bg-teal-500", barSoft: "bg-teal-200", text: "text-teal-600", note: "border-teal-200/70 bg-teal-50", soft: "bg-teal-50", hex: "#14b8a6" },
  emerald: { badge: "bg-emerald-50 text-emerald-700", tile: "bg-emerald-50 text-emerald-600", dot: "bg-emerald-500", bar: "bg-emerald-500", barSoft: "bg-emerald-200", text: "text-emerald-600", note: "border-emerald-200/70 bg-emerald-50", soft: "bg-emerald-50", hex: "#10b981" },
  lime: { badge: "bg-lime-50 text-lime-700", tile: "bg-lime-50 text-lime-600", dot: "bg-lime-500", bar: "bg-lime-500", barSoft: "bg-lime-200", text: "text-lime-600", note: "border-lime-200/70 bg-lime-50", soft: "bg-lime-50", hex: "#84cc16" },
  yellow: { badge: "bg-yellow-50 text-yellow-700", tile: "bg-yellow-50 text-yellow-600", dot: "bg-yellow-400", bar: "bg-yellow-400", barSoft: "bg-yellow-200", text: "text-yellow-600", note: "border-yellow-200/70 bg-yellow-50", soft: "bg-yellow-50", hex: "#facc15" },
  amber: { badge: "bg-amber-50 text-amber-700", tile: "bg-amber-50 text-amber-600", dot: "bg-amber-500", bar: "bg-amber-400", barSoft: "bg-amber-200", text: "text-amber-600", note: "border-amber-200/70 bg-amber-50", soft: "bg-amber-50", hex: "#f59e0b" },
  orange: { badge: "bg-orange-50 text-orange-700", tile: "bg-orange-50 text-orange-600", dot: "bg-orange-500", bar: "bg-orange-400", barSoft: "bg-orange-200", text: "text-orange-600", note: "border-orange-200/70 bg-orange-50", soft: "bg-orange-50", hex: "#fb923c" },
  rose: { badge: "bg-rose-50 text-rose-700", tile: "bg-rose-50 text-rose-600", dot: "bg-rose-500", bar: "bg-rose-500", barSoft: "bg-rose-200", text: "text-rose-600", note: "border-rose-200/70 bg-rose-50", soft: "bg-rose-50", hex: "#f43f5e" },
  pink: { badge: "bg-pink-50 text-pink-700", tile: "bg-pink-50 text-pink-600", dot: "bg-pink-500", bar: "bg-pink-500", barSoft: "bg-pink-200", text: "text-pink-600", note: "border-pink-200/70 bg-pink-50", soft: "bg-pink-50", hex: "#ec4899" },
  violet: { badge: "bg-violet-50 text-violet-700", tile: "bg-violet-50 text-violet-600", dot: "bg-violet-500", bar: "bg-violet-500", barSoft: "bg-violet-200", text: "text-violet-600", note: "border-violet-200/70 bg-violet-50", soft: "bg-violet-50", hex: "#a78bfa" },
  indigo: { badge: "bg-indigo-50 text-indigo-700", tile: "bg-indigo-50 text-indigo-600", dot: "bg-indigo-500", bar: "bg-indigo-500", barSoft: "bg-indigo-200", text: "text-indigo-600", note: "border-indigo-200/70 bg-indigo-50", soft: "bg-indigo-50", hex: "#6366f1" },
};

export const colorOf = (name: string | null | undefined) => COLORS[(name as ColorName) in COLORS ? (name as ColorName) : "slate"];

/** Colours offered in pickers. */
export const PICKER_COLORS: ColorName[] = ["blue", "sky", "teal", "emerald", "lime", "yellow", "amber", "orange", "rose", "pink", "violet", "indigo", "slate"];
