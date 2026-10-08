"use client";

import { useState, type FormEvent } from "react";
import useSWR from "swr";
import { ExternalLink, Loader2 } from "lucide-react";
import { api, errorMessage, refresh } from "@/lib/api";
import { KINDS, parseList, titleFromLink } from "@/lib/library";
import { ideasFor, searchLinks, STARTER_IDEAS, type StarterIdea } from "@/lib/starter-ideas";
import type { CourseSummary, LearningResource, ResourceKind, ResourceRead } from "@/lib/types";
import { Field } from "@/components/ui/controls";
import { useFeedback } from "@/components/ui/feedback";
import { ModalActions } from "@/components/ui/modal";

function CourseSelect({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  const { data } = useSWR<{ items: CourseSummary[] }>("/courses");
  return (
    <select id={id} className="select select-lg" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">No subject</option>
      {(data?.items ?? []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
    </select>
  );
}

/** Reads up to a few links at a time, so a pasted list of 20 links gets real titles without waiting for each in turn. */
async function readTitles(urls: string[], onProgress: (done: number) => void) {
  const found = new Map<string, ResourceRead>();
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < urls.length) {
      const url = urls[next++];
      try {
        found.set(url, await api<ResourceRead>("/resources/read", { method: "POST", body: { url } }));
      } catch {
        // an unreadable link keeps the title made from its address
      }
      onProgress(++done);
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, urls.length) }, worker));
  return found;
}

/** Paste many links or titles, one per line. */
export function PasteList({ courseId, onClose }: { courseId?: string | null; onClose: () => void }) {
  const { toast } = useFeedback();
  const [text, setText] = useState("");
  const [course, setCourse] = useState(courseId ?? "");
  const [kind, setKind] = useState<ResourceKind | "auto">("auto");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const lines = parseList(text);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!lines.length) return setError("Paste at least one link or title.");
    if (lines.length > 50) return setError("Add at most 50 at a time.");
    setBusy(true);
    setError("");
    try {
      // Links without a title get theirs from the page (up to 15 links; the rest are named from their address).
      const needTitle = lines.filter((l) => !l.title && l.url).map((l) => l.url).slice(0, 15);
      let found = new Map<string, ResourceRead>();
      if (needTitle.length) {
        setProgress(`Reading ${needTitle.length} link${needTitle.length === 1 ? "" : "s"}…`);
        found = await readTitles(needTitle, (n) => setProgress(`Read ${n} of ${needTitle.length} links…`));
      }
      const items = lines.map((l) => {
        const info = found.get(l.url);
        return { title: l.title || info?.title || titleFromLink(l.url), url: l.url, ...(info?.platform ? { platform: info.platform } : {}), ...(info && kind === "auto" ? { kind: info.kind } : {}) };
      });
      await api<{ items: LearningResource[] }>("/resources/bulk", { method: "POST", body: { items, course_id: course || null, ...(kind !== "auto" ? { kind } : {}) } });
      await refresh("/resources");
      toast(`Added ${items.length} ${items.length === 1 ? "item" : "items"} to the library`);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{error}</p>}
      <Field label="Links or titles, one on each line" htmlFor="paste-list" hint="Examples: a YouTube playlist link, “SEO Basics | https://…”, or just a title. Titles are read from the links.">
        <textarea id="paste-list" className="input min-h-40" value={text} onChange={(e) => setText(e.target.value)} placeholder={"https://www.youtube.com/playlist?list=…\nGoogle Ads Search certification\nEmail marketing | https://academy.hubspot.com/…"} autoFocus />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Subject" htmlFor="paste-course">
          <CourseSelect id="paste-course" value={course} onChange={setCourse} />
        </Field>
        <Field label="Type" htmlFor="paste-kind">
          <select id="paste-kind" className="select select-lg" value={kind} onChange={(e) => setKind(e.target.value as ResourceKind | "auto")}>
            <option value="auto">Find from each link</option>
            {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </Field>
      </div>
      <p className="text-sm text-slate-500" aria-live="polite">
        {busy && progress ? (
          <span className="inline-flex items-center gap-2"><Loader2 className="size-4 animate-spin" />{progress}</span>
        ) : lines.length ? (
          `${lines.length} ${lines.length === 1 ? "item" : "items"} found.`
        ) : (
          "Nothing found yet."
        )}
      </p>
      <ModalActions onCancel={onClose} submitLabel={lines.length ? `Add ${lines.length}` : "Add"} busy={busy} disabled={!lines.length} />
    </form>
  );
}

/** Ideas people usually take for a subject: tick the ones you want and add them in one go. */
export function StarterIdeas({ courseId, courseName, onClose }: { courseId?: string | null; courseName?: string; onClose: () => void }) {
  const { toast } = useFeedback();
  const [subject, setSubject] = useState(ideasFor(courseName ?? "")?.subject ?? STARTER_IDEAS[0].subject);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [course, setCourse] = useState(courseId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ideas = STARTER_IDEAS.find((s) => s.subject === subject)?.ideas ?? [];

  const toggle = (title: string) =>
    setPicked((current) => {
      const next = new Set(current);
      if (!next.delete(title)) next.add(title);
      return next;
    });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const chosen = ideas.filter((i) => picked.has(i.title));
    if (!chosen.length) return setError("Tick at least one idea.");
    setBusy(true);
    setError("");
    try {
      const items = chosen.map((i: StarterIdea) => ({ title: i.title, url: "", kind: i.kind, platform: i.platform, est_hours: i.hours, skills: i.skills }));
      await api("/resources/bulk", { method: "POST", body: { items, course_id: course || null } });
      await refresh("/resources");
      toast(`Added ${items.length} ${items.length === 1 ? "idea" : "ideas"}. Open each to add its link.`);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{error}</p>}
      <p className="text-sm text-slate-600">Pick a subject, tick what you want to take, then search for the best version of each and add its link.</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Subject">
        {STARTER_IDEAS.map((s) => (
          <button
            key={s.subject}
            type="button"
            aria-pressed={s.subject === subject}
            onClick={() => {
              setSubject(s.subject);
              setPicked(new Set());
            }}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition ${s.subject === subject ? "border-blue-300 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
          >
            {s.subject}
          </button>
        ))}
      </div>
      <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
        {ideas.map((idea) => {
          const links = searchLinks(idea.title);
          return (
            <li key={idea.title} className="flex items-start gap-3 px-3 py-2.5">
              <input id={`idea-${idea.title}`} type="checkbox" className="checkbox checkbox-green mt-0.5 shrink-0" checked={picked.has(idea.title)} onChange={() => toggle(idea.title)} />
              <div className="min-w-0 flex-1">
                <label htmlFor={`idea-${idea.title}`} className="block text-sm font-medium text-slate-800">{idea.title}</label>
                <p className="text-xs text-slate-500">{idea.kind === "playlist" ? "YouTube playlist" : `Certificate course · ${idea.platform}`} · about {idea.hours}h</p>
                <p className="mt-1 flex flex-wrap gap-x-3 text-xs">
                  <a href={links.youtube} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-blue-600">Search YouTube <ExternalLink className="size-3" /></a>
                  <a href={links.web} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-blue-600">Search the web <ExternalLink className="size-3" /></a>
                </p>
              </div>
            </li>
          );
        })}
      </ul>
      <Field label="Add to subject" htmlFor="ideas-course">
        <CourseSelect id="ideas-course" value={course} onChange={setCourse} />
      </Field>
      <ModalActions onCancel={onClose} submitLabel={picked.size ? `Add ${picked.size}` : "Add"} busy={busy} disabled={!picked.size} />
    </form>
  );
}
