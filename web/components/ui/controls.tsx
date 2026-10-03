"use client";

import type { ReactNode } from "react";
import { COLORS, PICKER_COLORS } from "@/lib/colors";
import type { ColorName } from "@/lib/types";
import { Icon, type IconName } from "./icon";

/** Tabs that look like a pill switch. */
export function Segmented<T extends string>({ value, onChange, options, label }: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: ReactNode }[];
  label: string;
}) {
  return (
    <div className="segmented" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)} />;
}

/** Round colour swatches (inside a form: sends `name`). */
export function ColorPicker({ name, value, colors = PICKER_COLORS }: { name: string; value: ColorName; colors?: ColorName[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {colors.map((color) => (
        <label key={color} title={color}>
          <input type="radio" name={name} value={color} defaultChecked={color === value} className="peer sr-only" />
          <span className={`block size-7 rounded-full ring-offset-2 peer-checked:ring-2 peer-checked:ring-blue-500 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-300 ${color === "white" ? "border border-slate-300 bg-white" : COLORS[color].dot}`} />
        </label>
      ))}
    </div>
  );
}

/** Grid of icon choices (inside a form: sends `name`). */
export function IconPicker({ name, value, icons }: { name: string; value: string; icons: IconName[] }) {
  return (
    <div className="grid grid-cols-8 gap-2">
      {icons.map((icon) => (
        <label key={icon} title={icon}>
          <input type="radio" name={name} value={icon} defaultChecked={icon === value} className="peer sr-only" />
          <span className="grid h-10 place-items-center rounded-xl border border-slate-200 text-slate-500 transition peer-checked:border-blue-300 peer-checked:bg-blue-50 peer-checked:text-blue-600 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-300">
            <Icon name={icon} className="size-5" />
          </span>
        </label>
      ))}
    </div>
  );
}

/** Label + field + optional hint. */
export function Field({ label, htmlFor, hint, children, className = "" }: { label: string; htmlFor?: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
