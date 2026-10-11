"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Copy, ExternalLink, Globe, Loader2, StickyNote } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { publicNotesUrl } from "@/lib/linkify";
import { useSaveLater } from "@/lib/use-save-later";
import type { Course } from "@/lib/types";
import { Switch } from "@/components/ui/controls";
import { useFeedback } from "@/components/ui/feedback";

export type SavedNotes = { notes: string; notes_share: string | null; notes_updated_at: string | null };
type SaveState = "saved" | "unsaved" | "saving" | "error";

const LIMIT = 20000;

/**
 * Your notes about the course. They are saved by themselves a moment after you stop typing. "Make public" gives them a secret
 * link that anyone can open without signing in (they can read these notes and nothing else); turning it off stops the link at once.
 */
export function CourseNotes({ course, onSaved }: { course: Course; onSaved: (saved: SavedNotes) => void }) {
  const { toast, confirm } = useFeedback();
  const saveLater = useSaveLater(900);
  const [text, setText] = useState(course.notes);
  const [state, setState] = useState<SaveState>("saved");
  const stateRef = useRef<SaveState>("saved");
  const newest = useRef(0); // the newest save: an answer to an older one must not mark the notes saved
  const [sharing, setSharing] = useState(false);
  // The address of this site (the server does not know it while drawing the page: an empty text then).
  const origin = useSyncExternalStore(() => () => {}, () => window.location.origin, () => "");
  const link = useRef<HTMLInputElement>(null);
  const isPublic = course.notes_share !== null;
  const url = isPublic && origin ? publicNotesUrl(origin, course.notes_share!) : "";

  const mark = (next: SaveState) => {
    stateRef.current = next;
    setState(next);
  };
  // Notes changed somewhere else (another tab or phone) show up here too, as long as nothing typed here is waiting to be saved.
  useEffect(() => {
    if (stateRef.current === "saved") setText(course.notes);
  }, [course.notes]);

  const save = async (value: string) => {
    const mine = ++newest.current;
    mark("saving");
    try {
      const saved = await api<SavedNotes>(`/courses/${course.id}/notes`, { method: "PATCH", body: { notes: value } });
      if (mine !== newest.current) return; // a newer save is on its way
      onSaved(saved);
      mark("saved");
    } catch (error) {
      if (mine !== newest.current) return;
      mark("error");
      toast(`Your notes could not be saved: ${errorMessage(error)}`, "error");
    }
  };

  const type = (value: string) => {
    setText(value);
    mark("unsaved");
    saveLater("notes", () => save(value));
  };

  const setPublic = async (next: boolean) => {
    if (next && !(await confirm({ title: "Make these notes public?", message: "Anyone who has the link can read these notes, without signing in. Nothing else from the course is shared. You can turn it off at any time and the link stops working at once.", action: "Make public" }))) return;
    setSharing(true);
    try {
      await saveLater.flush("notes"); // the latest text goes first, so the public page is never behind
      const saved = await api<SavedNotes>(`/courses/${course.id}/notes`, { method: "PATCH", body: { public: next } });
      onSaved(saved);
      toast(next ? "Your notes are public now. Copy the link to share them." : "Your notes are private again. The old link no longer works.");
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setSharing(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied");
    } catch {
      link.current?.select();
      toast("Press Ctrl+C (or hold and copy) to copy the link.", "info");
    }
  };

  const status = { saved: "Saved", saving: "Saving…", unsaved: "Not saved yet", error: "Could not save" }[state];

  return (
    <section className="card mt-5 p-5" aria-labelledby="notes-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="notes-title" className="flex items-center gap-2 text-lg font-bold text-[#12305a]">
          <StickyNote className="size-5" aria-hidden /> Notes
        </h2>
        <p className={`flex items-center gap-1.5 text-xs ${state === "error" ? "text-rose-600" : "text-slate-400"}`} aria-live="polite">
          {state === "saving" && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
          {status}
          {state === "error" && (
            <button type="button" className="font-medium text-blue-600" onClick={() => save(text)}>Try again</button>
          )}
        </p>
      </div>

      <label htmlFor="course-notes" className="sr-only">Notes about this course</label>
      <textarea
        id="course-notes"
        className="input mt-3 min-h-40 w-full resize-y leading-6"
        value={text}
        maxLength={LIMIT}
        onChange={(e) => type(e.target.value)}
        onBlur={() => saveLater.flush("notes")}
        placeholder="Write what you want to remember about this course: key points, links, questions…"
      />
      {text.length >= LIMIT - 2000 && <p className="mt-1 text-right text-xs text-slate-400">{text.length.toLocaleString("en-US")} / {LIMIT.toLocaleString("en-US")}</p>}

      <div className="mt-4 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-medium text-slate-800">
              <Globe className={`size-4 shrink-0 ${isPublic ? "text-emerald-600" : "text-slate-400"}`} aria-hidden />
              Make these notes public
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {isPublic
                ? "Public: anyone with the link can read these notes, and sees changes as you save them. Nothing else from the course is shared."
                : "Private: only you can see them. Turn this on to get a link that anyone can open without signing in."}
            </p>
          </div>
          <span className={sharing ? "pointer-events-none opacity-50" : ""}>
            <Switch checked={isPublic} onChange={setPublic} label="Make these notes public" />
          </span>
        </div>
        {isPublic && (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input ref={link} readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="input min-w-0 flex-1 text-sm" aria-label="Public link to these notes" />
            <span className="flex gap-2">
              <button type="button" className="btn btn-secondary btn-sm" onClick={copy} disabled={!url}>
                <Copy className="size-4" aria-hidden /> Copy link
              </button>
              <a href={url || undefined} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm" aria-disabled={!url}>
                <ExternalLink className="size-4" aria-hidden /> Open
              </a>
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
