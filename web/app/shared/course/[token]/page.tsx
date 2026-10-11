import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { splitLinks } from "@/lib/linkify";
import { loadPublicNotes } from "@/lib/server/public-notes";

// The notes change when their owner types, so this page is never kept.
export const dynamic = "force-dynamic";

const load = cache(loadPublicNotes);

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await load((await params).token);
  // Public but unlisted: search engines are asked to stay away.
  return { title: found ? `${found.title} · Notes` : "Notes", robots: { index: false, follow: false } };
}

/** The notes of a course that its owner made public. No sign-in: whoever has the link can read them (and only them). */
export default async function PublicCourseNotes({ params }: Props) {
  const found = await load((await params).token);
  if (!found) notFound();
  const updated = found.updated_at
    ? new Date(found.updated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Dhaka" })
    : null;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-2xl">
        <p className="flex items-center gap-2 text-sm font-medium text-slate-500">
          <span className="icon-tile size-8 bg-blue-50 text-blue-600"><GraduationCap className="size-4.5" aria-hidden /></span>
          Shared notes
        </p>
        <h1 className="mt-3 break-words text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{found.title}</h1>
        {updated && <p className="mt-1 text-sm text-slate-500">Updated {updated}</p>}

        <article className="card mt-6 p-5 sm:p-6" aria-label="Notes">
          {found.notes.trim() ? (
            <p className="whitespace-pre-wrap break-words text-[15px] leading-7 text-slate-800">
              {splitLinks(found.notes).map((piece, i) =>
                piece.href ? (
                  <a key={i} href={piece.href} target="_blank" rel="noopener noreferrer nofollow ugc" className="font-medium text-blue-600 underline underline-offset-2 hover:text-blue-700">
                    {piece.text}
                  </a>
                ) : (
                  <span key={i}>{piece.text}</span>
                ),
              )}
            </p>
          ) : (
            <p className="text-sm text-slate-500">There are no notes yet.</p>
          )}
        </article>

        <p className="mt-6 text-center text-xs text-slate-400">Read-only. Only these notes are shared, nothing else from the course.</p>
      </div>
    </main>
  );
}
