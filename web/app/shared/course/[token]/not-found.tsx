import type { Metadata } from "next";
import { LinkIcon } from "lucide-react";

export const metadata: Metadata = { title: "Link not available", robots: { index: false, follow: false } };

/** Shown for a link that does not work: made private since, deleted, or mistyped. It does not say which. */
export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="card max-w-md p-8 text-center">
        <span className="icon-tile mx-auto size-12 bg-slate-100 text-slate-400"><LinkIcon className="size-6" aria-hidden /></span>
        <h1 className="mt-4 text-lg font-semibold text-slate-900">This link is not available</h1>
        <p className="mt-1 text-sm text-slate-500">The notes may have been made private or removed, or the address is not complete. Ask the person who shared it for a new link.</p>
      </div>
    </main>
  );
}
