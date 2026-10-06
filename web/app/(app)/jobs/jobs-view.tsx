"use client";

import { useState, type FormEvent } from "react";
import useSWR from "swr";
import { BriefcaseBusiness, CalendarClock, ChevronDown, ExternalLink, GraduationCap, Link2, Loader2, MapPin, Plus, Sparkles, Trash2, X } from "lucide-react";
import { api, errorMessage, refresh } from "@/lib/api";
import { formatDate } from "@/lib/dates";
import { deadlineLabel, isOpen, skillKey, skillMatch, skillsToLearn } from "@/lib/jobs";
import { useNewAction } from "@/lib/new-action";
import type { JobApplication, JobStatus, List, Profile } from "@/lib/types";
import { Progress } from "@/components/ui/charts";
import { Field } from "@/components/ui/controls";
import { useFeedback } from "@/components/ui/feedback";
import { Modal, ModalActions } from "@/components/ui/modal";
import { EmptyState, LoadError, PageHeader, PageSkeleton } from "@/components/ui/states";

const STATUSES: { value: JobStatus; label: string; badge: string }[] = [
  { value: "saved", label: "Saved", badge: "bg-slate-100 text-slate-700" },
  { value: "applied", label: "Applied", badge: "bg-blue-50 text-blue-700" },
  { value: "interview", label: "Interview", badge: "bg-violet-50 text-violet-700" },
  { value: "offer", label: "Offer", badge: "bg-emerald-50 text-emerald-700" },
  { value: "rejected", label: "Rejected", badge: "bg-rose-50 text-rose-700" },
];

export function JobsView() {
  const { data, error, mutate } = useSWR<List<JobApplication>>("/jobs");
  const { data: profile, mutate: mutateProfile } = useSWR<Profile>("/profile");
  const { toast, confirm } = useFeedback();
  const [adding, setAdding] = useState(false);
  useNewAction(() => setAdding(true));

  if (error && !data) return <LoadError error={error} retry={() => mutate()} />;
  if (!data || !profile) return <PageSkeleton />;

  const today = data.today!;
  const jobs = data.items;
  const mySkills = profile.skills ?? [];
  const toLearn = skillsToLearn(jobs, mySkills, today);
  const open = jobs.filter((j) => isOpen(j, today));
  const closed = jobs.filter((j) => !isOpen(j, today));

  const saveSkills = async (skills: string[]) => {
    await mutateProfile({ ...profile, skills }, { revalidate: false });
    try {
      await api("/profile", { method: "PATCH", body: { skills } });
    } catch (e) {
      toast(errorMessage(e), "error");
    }
    await refresh("/profile");
  };

  const update = async (job: JobApplication, changes: Partial<JobApplication>) => {
    await mutate((current) => current && { ...current, items: current.items.map((j) => (j.id === job.id ? { ...j, ...changes } : j)) }, { revalidate: false });
    try {
      await api(`/jobs/${job.id}`, { method: "PATCH", body: changes });
    } catch (e) {
      toast(errorMessage(e), "error");
    }
    await refresh("/jobs");
  };

  const remove = async (job: JobApplication) => {
    if (!(await confirm({ title: "Delete this job?", message: `“${job.title}” will be removed from your list.` }))) return;
    await mutate((current) => current && { ...current, items: current.items.filter((j) => j.id !== job.id) }, { revalidate: false });
    try {
      await api(`/jobs/${job.id}`, { method: "DELETE" });
      toast("Job deleted");
    } catch (e) {
      toast(errorMessage(e), "error");
    }
    await refresh("/jobs");
  };

  const card = (job: JobApplication) => <JobCard key={job.id} job={job} today={today} mySkills={mySkills} onChange={(c) => update(job, c)} onDelete={() => remove(job)} onLearned={(skill) => saveSkills([...mySkills, skill])} />;

  return (
    <>
      <PageHeader title="Job Apply" description="Save a job link: the AI reads it, finds the last date to apply, and shows what to learn.">
        <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
          <Plus className="size-4" />
          Add Job
        </button>
      </PageHeader>

      <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">
          {jobs.length ? (
            <>
              {open.map(card)}
              {closed.length > 0 && (
                <>
                  <h2 className="pt-2 text-sm font-semibold text-slate-500">Closed or finished ({closed.length})</h2>
                  <div className="space-y-4 opacity-75">{closed.map(card)}</div>
                </>
              )}
            </>
          ) : (
            <EmptyState icon={BriefcaseBusiness} title="No jobs saved yet" text="Paste a job link and the AI will read the post, find the deadline and list the skills it asks for.">
              <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
                <Plus className="size-4" />
                Add your first job
              </button>
            </EmptyState>
          )}
        </div>

        <aside className="space-y-5">
          <SkillsCard skills={mySkills} onSave={saveSkills} />
          <section className="card p-5">
            <h2 className="card-title flex items-center gap-2.5">
              <span className="icon-tile size-8 bg-violet-50 text-violet-600"><GraduationCap className="size-4.5" /></span>
              Skills to learn
            </h2>
            <p className="mt-1 text-xs text-slate-500">Asked for by your open jobs, but not in your skills. Most wanted first.</p>
            {toLearn.length ? (
              <ol className="mt-4 space-y-2.5">
                {toLearn.slice(0, 15).map((s) => (
                  <li key={skillKey(s.skill)} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800">{s.skill}</p>
                      <p className="truncate text-xs text-slate-400" title={s.jobs.join(", ")}>{s.jobs.join(", ")}</p>
                    </div>
                    <span className="badge shrink-0 bg-violet-50 text-violet-700">{s.jobs.length} {s.jobs.length === 1 ? "job" : "jobs"}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-4 text-sm text-slate-500">{open.length ? "You have every skill your open jobs ask for. 🎉" : "Add a job to see what to learn."}</p>
            )}
          </section>
        </aside>
      </div>

      <AddJobModal open={adding} onClose={() => setAdding(false)} />
    </>
  );
}

function JobCard({ job, today, mySkills, onChange, onDelete, onLearned }: {
  job: JobApplication; today: string; mySkills: string[];
  onChange: (changes: Partial<JobApplication>) => void; onDelete: () => void; onLearned: (skill: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { have, percent } = skillMatch(job.skills, mySkills);
  const haveKeys = new Set(have.map(skillKey));
  const label = deadlineLabel(job.deadline, today);
  const daysTone = !job.deadline ? "" : job.deadline < today ? "bg-slate-100 text-slate-500" : label.includes("today") || label.includes("tomorrow") || Number(label.split(" ")[0]) <= 3 ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700";
  const status = STATUSES.find((s) => s.value === job.status) ?? STATUSES[0];

  return (
    <article className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-slate-900">{job.title}</h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
            {job.company && <span>{job.company}</span>}
            {job.location && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" />{job.location}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {job.deadline ? (
            <span className={`badge ${daysTone}`} title={`Last date to apply: ${formatDate(job.deadline, "date")}`}>
              <CalendarClock className="mr-1 size-3.5" />
              {formatDate(job.deadline, "short")} · {label}
            </span>
          ) : (
            <span className="badge bg-slate-100 text-slate-500">No deadline given</span>
          )}
          <select
            aria-label="Status"
            className={`rounded-lg border-0 py-1 pl-2 pr-7 text-xs font-semibold ${status.badge}`}
            value={job.status}
            onChange={(e) => onChange({ status: e.target.value as JobStatus })}
          >
            {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>

      {job.skills.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center gap-3">
            <Progress value={percent} fill={percent >= 70 ? "bg-emerald-500" : percent >= 40 ? "bg-amber-400" : "bg-rose-400"} track="bg-slate-100" className="h-1.5 flex-1" />
            <span className="text-xs font-semibold text-slate-600">You match {percent}%</span>
          </div>
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Skills this job asks for">
            {job.skills.map((skill) =>
              haveKeys.has(skillKey(skill)) ? (
                <li key={skill} className="badge bg-emerald-50 text-emerald-700">✓ {skill}</li>
              ) : (
                <li key={skill}>
                  <button type="button" className="badge bg-rose-50 text-rose-700 transition hover:bg-rose-100" title="Click when you have learned it" onClick={() => onLearned(skill)}>
                    {skill}
                  </button>
                </li>
              ),
            )}
          </ul>
        </div>
      )}

      {job.summary && <p className="mt-3 text-sm text-slate-600">{job.summary}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
          <ChevronDown className={`size-4 transition ${expanded ? "rotate-180" : ""}`} />
          {expanded ? "Less" : `Requirements${job.requirements.length ? ` (${job.requirements.length})` : ""} & notes`}
        </button>
        {job.url && (
          <a href={job.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">
            <ExternalLink className="size-4" />
            Open post
          </a>
        )}
        {job.applied_on && <span className="text-xs text-slate-400">Applied {formatDate(job.applied_on, "short")}</span>}
        <button type="button" className="btn btn-ghost btn-sm btn-icon ml-auto text-slate-400 hover:text-rose-600" onClick={onDelete} aria-label="Delete job">
          <Trash2 className="size-4" />
        </button>
      </div>

      {expanded && (
        <div className="mt-3 space-y-4 border-t border-slate-100 pt-4">
          {job.requirements.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
              {job.requirements.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          )}
          <Field label="Your notes" htmlFor={`notes-${job.id}`}>
            <textarea
              id={`notes-${job.id}`}
              className="input min-h-20"
              defaultValue={job.notes}
              maxLength={5000}
              placeholder="Contact person, documents to send, interview date…"
              onBlur={(e) => e.target.value !== job.notes && onChange({ notes: e.target.value })}
            />
          </Field>
          <Field label="Last date to apply" htmlFor={`deadline-${job.id}`} hint="Fix it here if the AI got it wrong.">
            <input
              id={`deadline-${job.id}`}
              type="date"
              className="input max-w-48"
              defaultValue={job.deadline ?? ""}
              onBlur={(e) => (e.target.value || null) !== job.deadline && onChange({ deadline: e.target.value || null })}
            />
          </Field>
        </div>
      )}
    </article>
  );
}

function SkillsCard({ skills, onSave }: { skills: string[]; onSave: (skills: string[]) => void }) {
  const [text, setText] = useState("");
  const add = (e: FormEvent) => {
    e.preventDefault();
    // "React, SQL, Docker" adds three at once.
    const fresh = text.split(",").map((s) => s.trim()).filter((s) => s && !skills.some((k) => skillKey(k) === skillKey(s)));
    setText("");
    if (fresh.length) onSave([...skills, ...fresh]);
  };
  return (
    <section className="card p-5">
      <h2 className="card-title flex items-center gap-2.5">
        <span className="icon-tile size-8 bg-emerald-50 text-emerald-600"><Sparkles className="size-4.5" /></span>
        My skills
      </h2>
      <p className="mt-1 text-xs text-slate-500">Jobs are compared with these. Click a red skill on a job once you have learned it.</p>
      {skills.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-1.5">
          {skills.map((skill) => (
            <li key={skill} className="badge gap-1 bg-emerald-50 text-emerald-700">
              {skill}
              <button type="button" className="rounded-full p-0.5 hover:bg-emerald-100" aria-label={`Remove ${skill}`} onClick={() => onSave(skills.filter((s) => s !== skill))}>
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="mt-4">
        <label className="flex items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-2.5 transition focus-within:border-blue-300 focus-within:bg-blue-50/40">
          <Plus className="size-4 shrink-0 text-slate-400" />
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder="Add skills, e.g. React, SQL, English" className="min-w-0 flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400" />
        </label>
      </form>
    </section>
  );
}

function AddJobModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [paste, setPaste] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const url = String(form.get("url") ?? "").trim();
    const text = String(form.get("text") ?? "").trim();
    if (!url && !text) return setError("Paste a link or the job post.");
    setBusy(true);
    setError("");
    try {
      const job = await api<JobApplication>("/jobs", { method: "POST", body: { ...(url ? { url } : {}), ...(text ? { text } : {}) } });
      await refresh("/jobs");
      toast(`Saved “${job.title}”${job.deadline ? ` · apply by ${formatDate(job.deadline, "short")}` : ""}`);
      setPaste(false);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      // A site that blocks reading: offer the paste box right away.
      setPaste(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={() => !busy && onClose()} title="Add a job" description="The AI reads the post and fills in the rest.">
      <form onSubmit={submit} className="space-y-4">
        {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        <Field label="Job link" htmlFor="job-url">
          <div className="relative">
            <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input id="job-url" name="url" type="url" className="input pl-9" placeholder="https://jobs.bdjobs.com/…" autoFocus />
          </div>
        </Field>
        {paste ? (
          <Field label="Or paste the job post" htmlFor="job-text" hint="Use this when the website needs a login or blocks reading.">
            <textarea id="job-text" name="text" className="input min-h-40" maxLength={30000} placeholder="Copy the whole post here…" />
          </Field>
        ) : (
          <button type="button" className="text-sm font-medium text-blue-600 hover:text-blue-700" onClick={() => setPaste(true)}>
            Paste the job text instead
          </button>
        )}
        {busy && (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="size-4 animate-spin" />
            Reading the post… this takes 10–30 seconds.
          </p>
        )}
        <ModalActions onCancel={onClose} submitLabel={busy ? "Reading…" : "Add Job"} busy={busy} />
      </form>
    </Modal>
  );
}
