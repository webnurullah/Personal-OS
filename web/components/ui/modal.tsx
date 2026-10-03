"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

/** A pop-up window built on the browser's <dialog>: Esc and clicking outside close it. */
export function Modal({
  open,
  onClose,
  title,
  description,
  size = "md",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const pressedOnBackdrop = useRef(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const width = size === "sm" ? "max-w-sm" : size === "lg" ? "max-w-2xl" : "max-w-lg";

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onMouseDown={(e) => {
        pressedOnBackdrop.current = e.target === ref.current;
      }}
      onClick={(e) => {
        if (e.target === ref.current && pressedOnBackdrop.current) onClose();
      }}
      aria-label={title}
      className={`w-[calc(100%-2rem)] ${width} rounded-2xl bg-white p-0 shadow-2xl`}
    >
      {open && (
        <div className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
              {description && <p className="text-sm text-slate-500">{description}</p>}
            </div>
            <button type="button" className="btn btn-ghost btn-sm btn-icon -mr-2 -mt-1" onClick={onClose} aria-label="Close">
              <X className="size-5" />
            </button>
          </div>
          <div className="mt-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}

/** Cancel + main button row for the bottom of a form in a modal; `left` holds e.g. a Delete button. */
export function ModalActions({ onCancel, submitLabel, busy, danger, left }: { onCancel: () => void; submitLabel: string; busy?: boolean; danger?: boolean; left?: ReactNode }) {
  return (
    <div className="mt-6 flex items-center justify-between gap-2">
      <div>{left}</div>
      <div className="flex gap-2">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className={`btn ${danger ? "btn-danger" : "btn-primary"}`} disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </button>
      </div>
    </div>
  );
}
