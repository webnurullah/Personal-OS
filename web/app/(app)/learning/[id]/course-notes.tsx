"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2, StickyNote } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { useSaveLater } from "@/lib/use-save-later";
import type { Course } from "@/lib/types";
import { useFeedback } from "@/components/ui/feedback";

// The editor is only needed on this page, so it is loaded when the page is: the rest of the app does not carry it.
const RichEditor = dynamic(() => import("./rich-editor"), { ssr: false, loading: () => <div className="skeleton h-52 rounded-xl" aria-busy="true" aria-label="Loading the editor" /> });

export type SavedNotes = { notes: string; notes_updated_at: string | null };
type SaveState = "saved" | "unsaved" | "saving" | "error";

/** What the database accepts (the editor's text is HTML, which is longer than the words alone). */
const LIMIT = 100000;

/**
 * Your notes about the course, written in a small text editor. They are saved by themselves a moment after you stop typing, and at
 * once when you leave the box.
 */
export function CourseNotes({ course, onSaved }: { course: Course; onSaved: (saved: SavedNotes) => void }) {
  const { toast } = useFeedback();
  const saveLater = useSaveLater(900);
  // (A course kept in this browser before notes existed has no `notes` until the page asks again.)
  const savedNotes = course.notes ?? "";
  const [text, setText] = useState(savedNotes);
  const [state, setState] = useState<SaveState>("saved");
  const stateRef = useRef<SaveState>("saved");
  const newest = useRef(0); // bumps with every change you type and every save: an answer to an older one must not mark the notes saved
  const queue = useRef<Promise<unknown>>(Promise.resolve()); // saves go one after the other, so the last text typed is the last one stored

  const mark = (next: SaveState) => {
    stateRef.current = next;
    setState(next);
  };
  // Notes changed somewhere else (another tab or phone) show up here too, as long as nothing typed here is waiting to be saved.
  useEffect(() => {
    if (stateRef.current === "saved") setText(savedNotes);
  }, [savedNotes]);

  /** Saves `value`; true when it is stored. */
  const save = (value: string): Promise<boolean> => {
    const run = async () => {
      const mine = ++newest.current;
      mark("saving");
      try {
        const saved = await api<SavedNotes>(`/courses/${course.id}/notes`, { method: "PATCH", body: { notes: value } });
        if (mine !== newest.current) return true; // you typed more meanwhile: that text is on its way, nothing here is "saved" yet
        onSaved(saved);
        mark("saved");
        return true;
      } catch (error) {
        if (mine === newest.current) {
          mark("error");
          toast(`Your notes could not be saved: ${errorMessage(error)}`, "error");
        }
        return false;
      }
    };
    const result = queue.current.then(run, run);
    queue.current = result;
    return result;
  };

  const type = (html: string) => {
    newest.current++;
    setText(html);
    if (html.length > LIMIT) {
      mark("error");
      toast("These notes are too long to save. Shorten them a little.", "error");
      return;
    }
    mark("unsaved");
    saveLater("notes", () => save(html));
  };

  const status = { saved: "Saved", saving: "Saving…", unsaved: "Not saved yet", error: "Could not save" }[state];

  return (
    <section className="card mt-5 p-5" aria-labelledby="notes-title" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) void saveLater.flush("notes"); }}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="notes-title" className="flex items-center gap-2 text-lg font-bold text-[#12305a]">
          <StickyNote className="size-5" aria-hidden /> Notes
        </h2>
        <p className={`flex items-center gap-1.5 text-xs ${state === "error" ? "text-rose-600" : "text-slate-400"}`} aria-live="polite">
          {state === "saving" && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
          {status}
          {state === "error" && text.length <= LIMIT && (
            <button type="button" className="font-medium text-blue-600" onClick={() => save(text)}>Try again</button>
          )}
        </p>
      </div>
      <RichEditor value={text} onChange={type} label="Notes about this course" placeholder="Write what you want to remember about this course: key points, links, questions…" />
    </section>
  );
}
