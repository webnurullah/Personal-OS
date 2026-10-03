"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** A button that opens a small panel; closes on outside click or Esc. */
export function Dropdown({ button, buttonClassName, label, panelClassName, children }: {
  button: ReactNode;
  buttonClassName: string;
  label: string;
  panelClassName: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button type="button" aria-expanded={open} aria-label={label} onClick={() => setOpen((o) => !o)} className={buttonClassName}>
        {button}
      </button>
      {open && <div className={`absolute right-0 top-full z-30 mt-2 rounded-2xl border border-slate-200 bg-white shadow-xl ${panelClassName}`}>{children(() => setOpen(false))}</div>}
    </div>
  );
}
