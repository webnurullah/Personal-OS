"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { CircleAlert, RefreshCw } from "lucide-react";
import { errorMessage } from "@/lib/api";

/** Page title, one-line description and an optional button on the right. */
export function PageHeader({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">{title}</h1>
        <p className="mt-1 text-slate-500">{description}</p>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">{children}</div>}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, text, children }: { icon: LucideIcon; title: string; text: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-4 py-12 text-center">
      <span className="icon-tile size-12 bg-slate-100 text-slate-400">
        <Icon className="size-6" />
      </span>
      <p className="mt-3 text-sm font-medium text-slate-700">{title}</p>
      <p className="max-w-sm text-sm text-slate-500">{text}</p>
      {children && <div className="mt-4 flex gap-2">{children}</div>}
    </div>
  );
}

/** Grey shimmering blocks while data loads. */
export function Skeleton({ className }: { className: string }) {
  return <div className={`skeleton ${className}`} />;
}

export function PageSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-10 w-64" />
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-96" />
    </div>
  );
}

/** Shown when a request fails, with a retry button. */
export function LoadError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="card mx-auto mt-10 max-w-lg p-6 text-center">
      <span className="icon-tile mx-auto size-12 bg-rose-50 text-rose-500">
        <CircleAlert className="size-6" />
      </span>
      <p className="mt-3 font-semibold text-slate-900">This page could not load</p>
      <p className="mt-1 text-sm text-slate-500">{errorMessage(error)}</p>
      <button type="button" className="btn btn-secondary mt-5" onClick={retry}>
        <RefreshCw className="size-4" />
        Try again
      </button>
    </div>
  );
}
