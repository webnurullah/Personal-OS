"use client";

import { useState, type FormEvent } from "react";
import useSWR from "swr";
import { Award, Check, Copy, Sparkles } from "lucide-react";
import { api, errorMessage, refresh } from "@/lib/api";
import { formatDate } from "@/lib/dates";
import { mergeSkills } from "@/lib/jobs";
import { applyChange, resumeLine, suggestSkills } from "@/lib/library";
import type { LearningResource, Profile } from "@/lib/types";
import { Field } from "@/components/ui/controls";
import { useFeedback } from "@/components/ui/feedback";
import { ModalActions } from "@/components/ui/modal";
import { splitWords } from "./resource-form";
import { useCopy } from "./shared";

/**
 * "Make it count": what happens when you finish something. Add the certificate, keep the skills (they go to your
 * Job Apply skills), write what you can do now, and take a line for your CV. Everything is optional.
 */
export function CompleteDialog({ item, today, onClose }: { item: LearningResource; today: string; onClose: () => void }) {
  const { toast } = useFeedback();
  const copy = useCopy();
  const { data: profile, mutate: mutateProfile } = useSWR<Profile>("/profile");
  const offered = suggestSkills(item);
  const [skills, setSkills] = useState(offered.join(", "));
  const [addSkills, setAddSkills] = useState(true);
  const [rating, setRating] = useState(item.rating ? String(item.rating) : "");
  const [takeaway, setTakeaway] = useState(item.takeaway);
  const [certUrl, setCertUrl] = useState(item.certificate_url);
  const [certId, setCertId] = useState(item.certificate_id);
  const [issued, setIssued] = useState(item.issued_on ?? "");
  const [expires, setExpires] = useState(item.expires_on ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ item: LearningResource; added: string[] } | null>(null);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const link = certUrl.trim();
    if (link && !/^https?:\/\/\S+$/i.test(link)) return setError("The certificate link should start with https://");
    if (issued && expires && expires < issued) return setError("The certificate cannot expire before it was issued.");
    const list = splitWords(skills);
    setBusy(true);
    setError("");
    try {
      const saved = await api<LearningResource>(`/resources/${item.id}`, {
        method: "PATCH",
        body: {
          status: "completed",
          skills: list,
          rating: rating ? Number(rating) : null,
          takeaway: takeaway.trim(),
          certificate_url: link,
          certificate_id: certId.trim(),
          issued_on: issued || null,
          expires_on: expires || null,
        },
      });
      let added: string[] = [];
      if (addSkills && list.length && profile) {
        const merged = mergeSkills(profile.skills ?? [], list);
        added = merged.added;
        if (added.length) {
          try {
            await api("/profile", { method: "PATCH", body: { skills: merged.skills } });
            await mutateProfile({ ...profile, skills: merged.skills }, { revalidate: false });
            await refresh("/profile");
          } catch (err) {
            toast(`Saved, but your skills could not be updated: ${errorMessage(err)}`, "error");
            added = [];
          }
        }
      }
      await refresh("/resources");
      setDone({ item: saved, added });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    const line = resumeLine(done.item);
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl bg-emerald-50 p-4 ring-1 ring-emerald-100">
          <span className="icon-tile size-10 shrink-0 bg-emerald-100 text-emerald-700"><Check className="size-5" /></span>
          <div className="min-w-0">
            <p className="font-semibold text-emerald-900">Completed: {done.item.title}</p>
            {done.added.length > 0 ? (
              <p className="mt-0.5 text-sm text-emerald-800">Added to your skills: {done.added.join(", ")}. Job Apply now counts them.</p>
            ) : (
              <p className="mt-0.5 text-sm text-emerald-800">Well done. Now use it so it stays with you.</p>
            )}
          </div>
        </div>
        <div>
          <p className="label">A line for your CV or LinkedIn</p>
          <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-700 ring-1 ring-slate-100">{line}</p>
          <button type="button" className="btn btn-secondary btn-sm mt-2" onClick={() => copy(line, "Line copied. Paste it into your CV or LinkedIn.")}>
            <Copy className="size-4" /> Copy line
          </button>
        </div>
        <div className="flex justify-end">
          <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{error}</p>}
      <p className="text-sm text-slate-600">
        <b className="font-semibold text-slate-800">{item.title}</b> will be marked as completed
        {item.items_total > 0 ? ` (all ${item.items_total} counted as watched)` : ""} on {formatDate(applyChange(item, { status: "completed" }, today).completed_on ?? today, "date")}. Everything below is optional.
      </p>

      <Field label="Skills you gained" htmlFor="done-skills" hint="Separate with commas.">
        <input id="done-skills" className="input" value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="SEO, Google Analytics" autoComplete="off" />
      </Field>
      <label className="flex items-start gap-3 text-sm text-slate-700">
        <input type="checkbox" className="checkbox checkbox-green mt-0.5" checked={addSkills} onChange={(e) => setAddSkills(e.target.checked)} />
        <span><Sparkles className="mr-1 inline size-4 text-emerald-600" />Add them to my skills, so Job Apply counts them</span>
      </label>

      <Field label="What I can do now" htmlFor="done-takeaway" hint="One line, in your own words. It goes on your CV line.">
        <input id="done-takeaway" className="input" value={takeaway} onChange={(e) => setTakeaway(e.target.value)} maxLength={300} placeholder="e.g. I can run a small Google Ads search campaign" autoComplete="off" />
      </Field>
      <Field label="How good was it?" htmlFor="done-rating">
        <select id="done-rating" className="select select-lg" value={rating} onChange={(e) => setRating(e.target.value)}>
          <option value="">Not rated</option>
          {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{"★".repeat(n)} ({n})</option>)}
        </select>
      </Field>

      <fieldset className="space-y-4 rounded-xl border border-amber-100 bg-amber-50/40 p-3">
        <legend className="flex items-center gap-1.5 px-1 text-sm font-semibold text-amber-800"><Award className="size-4" /> Certificate</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Certificate link" htmlFor="done-cert-url">
            <input id="done-cert-url" className="input" value={certUrl} onChange={(e) => setCertUrl(e.target.value)} inputMode="url" placeholder="https://…" autoComplete="off" />
          </Field>
          <Field label="Certificate ID" htmlFor="done-cert-id">
            <input id="done-cert-id" className="input" value={certId} onChange={(e) => setCertId(e.target.value)} maxLength={120} autoComplete="off" />
          </Field>
          <Field label="Issued on" htmlFor="done-issued">
            <input id="done-issued" className="input" type="date" value={issued} onChange={(e) => setIssued(e.target.value)} />
          </Field>
          <Field label="Expires on" htmlFor="done-expires" hint="Leave empty if it never expires. You get a reminder before.">
            <input id="done-expires" className="input" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
          </Field>
        </div>
      </fieldset>

      <ModalActions onCancel={onClose} submitLabel="Mark complete" busy={busy} />
    </form>
  );
}
