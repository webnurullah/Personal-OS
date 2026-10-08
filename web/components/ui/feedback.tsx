"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { CircleAlert, CircleCheck, Info } from "lucide-react";
import { Modal } from "./modal";

type Tone = "success" | "error" | "info";
type Toast = { id: number; message: string; tone: Tone };
type ConfirmOptions = { title: string; message: string; action?: string };

const FeedbackContext = createContext<{
  toast: (message: string, tone?: Tone) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
} | null>(null);

/** Toasts (small messages in the corner) and a "Are you sure?" dialog, for the whole app. */
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pending, setPending] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<(answer: boolean) => void>(undefined);
  const nextId = useRef(0);

  const toast = useCallback((message: string, tone: Tone = "success") => {
    const id = ++nextId.current;
    setToasts((list) => [...list, { id, message, tone }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), tone === "error" ? 5000 : 2800);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    setPending(options);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const answer = (value: boolean) => {
    resolver.current?.(value);
    setPending(null);
  };

  return (
    <FeedbackContext.Provider value={{ toast, confirm }}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-20 z-[60] flex flex-col items-end gap-2 sm:inset-x-auto sm:bottom-24 sm:right-4" aria-live="polite">
        {toasts.map((t) => {
          const Icon = t.tone === "error" ? CircleAlert : t.tone === "info" ? Info : CircleCheck;
          const color = t.tone === "error" ? "text-rose-500" : t.tone === "info" ? "text-blue-600" : "text-emerald-600";
          return (
            <div key={t.id} className="pointer-events-auto flex max-w-sm min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-lg">
              <Icon className={`size-5 shrink-0 ${color}`} />
              <span>{t.message}</span>
            </div>
          );
        })}
      </div>
      <Modal open={pending !== null} onClose={() => answer(false)} title={pending?.title ?? ""} size="sm">
        <p className="text-sm text-slate-600">{pending?.message}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={() => answer(false)}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger" onClick={() => answer(true)} autoFocus>
            {pending?.action ?? "Delete"}
          </button>
        </div>
      </Modal>
    </FeedbackContext.Provider>
  );
}

export function useFeedback() {
  const value = useContext(FeedbackContext);
  if (!value) throw new Error("useFeedback must be used inside <FeedbackProvider>");
  return value;
}
