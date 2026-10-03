import type { ReactNode } from "react";
import { Sprout } from "lucide-react";

/** Centered card used by the sign-in pages. */
export function AuthCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-emerald-100 text-emerald-600">
            <Sprout className="size-6" />
          </span>
          <div className="leading-tight">
            <p className="text-lg font-bold text-slate-900">Nurullah POS</p>
            <p className="text-xs text-slate-500">Live well. Plan better.</p>
          </div>
        </div>
        <div className="card p-6 sm:p-7">
          <h1 className="text-xl font-bold text-slate-900">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </main>
  );
}

export function FormMessage({ tone, children }: { tone: "error" | "success"; children: ReactNode }) {
  return <p className={`rounded-xl px-3 py-2.5 text-sm ${tone === "error" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-800"}`}>{children}</p>;
}
