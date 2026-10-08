"use client";

import { useState, type FormEvent } from "react";
import useSWR from "swr";
import { Loader2, Sparkles, Trash2 } from "lucide-react";
import { api, errorMessage, refresh } from "@/lib/api";
import { fixLink, KINDS, PRIORITIES, STATUSES, readLink } from "@/lib/library";
import type { CourseDetail, CourseSummary, LearningResource, ResourceKind, ResourcePriority, ResourceRead, ResourceStatus } from "@/lib/types";
import { Field } from "@/components/ui/controls";
import { useProfile } from "@/lib/profile";
import { useFeedback } from "@/components/ui/feedback";
import { ModalActions } from "@/components/ui/modal";
import { useResourceActions } from "./shared";

/** "SEO, Google Ads" or one per line → a clean list without doubles. */
export const splitWords = (text: string) => [...new Set(text.split(/[,\n]/).map((w) => w.trim()).filter(Boolean))].slice(0, 30);

const noCourse = "";

/** Add or edit one item. Pasting a link fills in the title, platform and channel; every field can be typed or corrected by hand. */
export function ResourceForm({ item, courseId, onClose, onSaved }: { item: LearningResource | null; courseId?: string | null; onClose: () => void; onSaved?: (saved: LearningResource) => void }) {
  const { toast } = useFeedback();
  const { profile } = useProfile();
  const { remove } = useResourceActions();
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [f, setF] = useState({
    url: item?.url ?? "",
    title: item?.title ?? "",
    kind: (item?.kind ?? "certificate") as ResourceKind,
    platform: item?.platform ?? "",
    provider: item?.provider ?? "",
    course: item?.course_id ?? courseId ?? noCourse,
    unit: item?.unit_id ?? "",
    status: (item?.status ?? "todo") as ResourceStatus,
    priority: (item?.priority ?? "medium") as ResourcePriority,
    est: item?.est_hours ? String(Number(item.est_hours)) : "",
    total: item?.items_total ? String(item.items_total) : "",
    done: item?.items_done ? String(item.items_done) : "",
    due: item?.due_date ?? "",
    cost: item?.cost ? String(Number(item.cost)) : "",
    skills: (item?.skills ?? []).join(", "),
    notes: item?.notes ?? "",
    rating: item?.rating ? String(item.rating) : "",
    takeaway: item?.takeaway ?? "",
    completedOn: item?.completed_on ?? "",
    dropped: item?.dropped_reason ?? "",
    certUrl: item?.certificate_url ?? "",
    certId: item?.certificate_id ?? "",
    issued: item?.issued_on ?? "",
    expires: item?.expires_on ?? "",
  });
  const set = (key: keyof typeof f) => (e: { target: { value: string } }) => setF((c) => ({ ...c, [key]: e.target.value }));

  const { data: courses } = useSWR<{ items: CourseSummary[] }>("/courses");
  const { data: detail } = useSWR<CourseDetail>(f.course ? `/courses/${f.course}` : null);
  // Only the units of the course chosen now: while its page loads, SWR may still hold the previous course's.
  const units = f.course && detail?.course.id === f.course ? detail.units : [];

  const read = async (link: string) => {
    const url = fixLink(link);
    if (!/^https?:\/\/\S+\.\S+/i.test(url)) return;
    setReading(true);
    setError("");
    setNote("");
    // The platform and kind are known from the address at once; the title and channel need the page.
    const guess = readLink(url);
    setF((c) => ({ ...c, url, platform: c.platform || guess.platform, kind: item ? c.kind : guess.kind }));
    try {
      const found = await api<ResourceRead>("/resources/read", { method: "POST", body: { url } });
      setF((c) => ({ ...c, title: c.title || found.title, platform: c.platform || found.platform, provider: c.provider || found.provider }));
      if (found.note) setNote(found.note);
    } catch (e) {
      setNote(errorMessage(e));
    } finally {
      setReading(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const url = fixLink(f.url);
    const certUrl = fixLink(f.certUrl);
    if (url && !/^https?:\/\/\S+$/i.test(url)) return setError("The link should start with https://");
    if (certUrl && !/^https?:\/\/\S+$/i.test(certUrl)) return setError("The certificate link should start with https://");
    if (!f.title.trim()) return setError("Add a title.");
    const total = Math.round(Number(f.total) || 0);
    const done = Math.round(Number(f.done) || 0);
    if (done > total && total > 0) return setError(`You cannot have watched more than the ${total} in it.`);
    if (f.issued && f.expires && f.expires < f.issued) return setError("The certificate cannot expire before it was issued.");

    const body = {
      title: f.title.trim(),
      url,
      kind: f.kind,
      platform: f.platform.trim() || readLink(url).platform,
      provider: f.provider.trim(),
      course_id: f.course || null,
      unit_id: f.course && f.unit ? f.unit : null,
      status: f.status,
      priority: f.priority,
      est_hours: Number(f.est) || 0,
      items_total: total,
      items_done: total > 0 ? done : 0,
      due_date: f.due || null,
      cost: Number(f.cost) || 0,
      skills: splitWords(f.skills),
      notes: f.notes.trim(),
      dropped_reason: f.status === "dropped" ? f.dropped.trim() : "",
      ...(f.status === "completed"
        ? {
            rating: f.rating ? Number(f.rating) : null,
            takeaway: f.takeaway.trim(),
            certificate_url: certUrl,
            certificate_id: f.certId.trim(),
            issued_on: f.issued || null,
            expires_on: f.expires || null,
            ...(f.completedOn ? { completed_on: f.completedOn } : {}),
          }
        : {}),
    };
    setBusy(true);
    setError("");
    try {
      const saved = item
        ? await api<LearningResource>(`/resources/${item.id}`, { method: "PATCH", body })
        : await api<LearningResource>("/resources", { method: "POST", body });
      await refresh("/resources");
      toast(item ? "Saved" : `Added “${body.title}”`);
      onSaved?.(saved);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const del = async () => {
    if (item && (await remove(item))) onClose();
  };

  const counted = Number(f.total) > 0;

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{error}</p>}

      <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
        <label className="label" htmlFor="res-url">Link</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="res-url"
            className="input min-w-0 flex-1"
            value={f.url}
            onChange={set("url")}
            onPaste={(e) => {
              // A pasted link is read at once (when the title is still empty).
              const pasted = e.clipboardData.getData("text");
              if (!f.title.trim() && /^\s*(https?:\/\/|www\.)\S+\s*$/i.test(pasted)) setTimeout(() => read(pasted.trim()), 0);
            }}
            placeholder="https://www.youtube.com/playlist?list=…"
            inputMode="url"
            autoComplete="off"
            autoFocus={!item}
          />
          <button type="button" className="btn btn-secondary shrink-0 max-sm:w-full" disabled={reading || !f.url.trim()} onClick={() => read(f.url)}>
            {reading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            Read link
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">{note || "Paste a Coursera, Udemy, Google, HubSpot or YouTube link: the title and platform are filled in. Or type everything by hand."}</p>
      </div>

      <Field label="Title" htmlFor="res-title">
        <input id="res-title" className="input" value={f.title} onChange={set("title")} maxLength={300} required autoComplete="off" placeholder="e.g. Google Ads Search certification" />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type" htmlFor="res-kind">
          <select id="res-kind" className="select select-lg" value={f.kind} onChange={set("kind")}>
            {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </Field>
        <Field label="Platform" htmlFor="res-platform">
          <input id="res-platform" className="input" value={f.platform} onChange={set("platform")} maxLength={60} placeholder="Coursera, YouTube …" autoComplete="off" />
        </Field>
      </div>
      <Field label="Channel or school" htmlFor="res-provider">
        <input id="res-provider" className="input" value={f.provider} onChange={set("provider")} maxLength={120} autoComplete="off" />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Subject (one of your courses)" htmlFor="res-course">
          <select id="res-course" className="select select-lg" value={f.course} onChange={(e) => setF((c) => ({ ...c, course: e.target.value, unit: "" }))}>
            <option value={noCourse}>No subject</option>
            {(courses?.items ?? []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </Field>
        <Field label="Unit" htmlFor="res-unit">
          <select id="res-unit" className="select select-lg" value={f.unit} onChange={set("unit")} disabled={!units.length}>
            <option value="">{f.course ? (units.length ? "Whole subject" : "No units yet") : "Pick a subject first"}</option>
            {units.map((u) => <option key={u.id} value={u.id}>{u.title || `Unit ${u.code}`}</option>)}
          </select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Status" htmlFor="res-status">
          <select id="res-status" className="select select-lg" value={f.status} onChange={set("status")}>
            {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="Priority" htmlFor="res-priority">
          <select id="res-priority" className="select select-lg" value={f.priority} onChange={set("priority")}>
            {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </Field>
        <Field label="Hours (total)" htmlFor="res-est">
          <input id="res-est" className="input" type="number" min={0} max={1000} step={0.25} value={f.est} onChange={set("est")} placeholder="e.g. 8" />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={f.kind === "playlist" ? "Videos in it" : "Lessons in it"} htmlFor="res-total" hint="Leave empty if you do not count.">
          <input id="res-total" className="input" type="number" min={0} max={5000} step={1} value={f.total} onChange={set("total")} placeholder="e.g. 24" />
        </Field>
        <Field label="Watched so far" htmlFor="res-done">
          <input id="res-done" className="input" type="number" min={0} max={5000} step={1} value={counted ? f.done : ""} onChange={set("done")} disabled={!counted} />
        </Field>
        <Field label="Deadline" htmlFor="res-due" hint="Enrolment or free access ends.">
          <input id="res-due" className="input" type="date" value={f.due} onChange={set("due")} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="What it teaches" htmlFor="res-skills" hint="Separate with commas. They can be added to your skills when you finish.">
          <input id="res-skills" className="input" value={f.skills} onChange={set("skills")} placeholder="SEO, Google Analytics" autoComplete="off" />
        </Field>
        <Field label={`Cost (${profile?.currency === "USD" ? "$" : "৳"})`} htmlFor="res-cost" hint="0 if it is free.">
          <input id="res-cost" className="input" type="number" min={0} step={1} value={f.cost} onChange={set("cost")} />
        </Field>
      </div>

      {f.status === "dropped" && (
        <Field label="Why was it dropped?" htmlFor="res-dropped">
          <input id="res-dropped" className="input" value={f.dropped} onChange={set("dropped")} maxLength={300} placeholder="e.g. Too basic, or the course was removed" autoComplete="off" />
        </Field>
      )}

      {f.status === "completed" && (
        <div className="space-y-4 rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
          <p className="text-sm font-semibold text-emerald-800">Completed</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Completed on" htmlFor="res-completed">
              <input id="res-completed" className="input" type="date" value={f.completedOn} onChange={set("completedOn")} />
            </Field>
            <Field label="Your rating" htmlFor="res-rating">
              <select id="res-rating" className="select select-lg" value={f.rating} onChange={set("rating")}>
                <option value="">Not rated</option>
                {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{"★".repeat(n)} ({n})</option>)}
              </select>
            </Field>
          </div>
          <Field label="What I can do now" htmlFor="res-takeaway" hint="One line, in your own words.">
            <input id="res-takeaway" className="input" value={f.takeaway} onChange={set("takeaway")} maxLength={300} autoComplete="off" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Certificate link" htmlFor="res-cert-url">
              <input id="res-cert-url" className="input" value={f.certUrl} onChange={set("certUrl")} inputMode="url" placeholder="https://…" autoComplete="off" />
            </Field>
            <Field label="Certificate ID" htmlFor="res-cert-id">
              <input id="res-cert-id" className="input" value={f.certId} onChange={set("certId")} maxLength={120} autoComplete="off" />
            </Field>
            <Field label="Issued on" htmlFor="res-issued">
              <input id="res-issued" className="input" type="date" value={f.issued} onChange={set("issued")} />
            </Field>
            <Field label="Expires on" htmlFor="res-expires" hint="Leave empty if it never expires.">
              <input id="res-expires" className="input" type="date" value={f.expires} onChange={set("expires")} />
            </Field>
          </div>
        </div>
      )}

      <Field label="Notes" htmlFor="res-notes">
        <textarea id="res-notes" className="input min-h-20" value={f.notes} onChange={set("notes")} maxLength={2000} />
      </Field>

      <ModalActions
        onCancel={onClose}
        submitLabel={item ? "Save" : "Add to library"}
        busy={busy}
        left={
          item && (
            <button type="button" className="btn btn-ghost text-rose-600" onClick={del}>
              <Trash2 className="size-4" /> Delete
            </button>
          )
        }
      />
    </form>
  );
}
