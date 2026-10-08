"use client";

import { toArchive } from "@/lib/archive";
import { useState, type DragEvent, type FormEvent } from "react";
import useSWR from "swr";
import { BriefcaseBusiness, CalendarClock, Check, ChevronDown, Download, ExternalLink, GraduationCap, LayoutGrid, Link2, List as ListIcon, Loader2, MapPin, Pencil, Plus, Sparkles, Trash2, X } from "lucide-react";
import { api, errorMessage, refresh } from "@/lib/api";
import { daysBetween, formatDate } from "@/lib/dates";
import { fixLink } from "@/lib/job-actions";
import { deadlineLabel, isOpen, matchPercent, mergeSkills, skillKey, skillMatch, skillsToLearn } from "@/lib/jobs";
import { useNewAction } from "@/lib/new-action";
import type { JobAnalysis, JobApplication, JobStatus, LearningResource, List, Profile } from "@/lib/types";
import { Progress } from "@/components/ui/charts";
import { Field, Segmented } from "@/components/ui/controls";
import { useFeedback } from "@/components/ui/feedback";
import { Modal, ModalActions } from "@/components/ui/modal";
import { EmptyState, LoadError, PageHeader, PageSkeleton } from "@/components/ui/states";

const STATUSES: { value: JobStatus; label: string; badge: string; column: string }[] = [
  { value: "saved", label: "Saved", badge: "bg-slate-100 text-slate-700", column: "bg-slate-50" },
  { value: "applied", label: "Applied", badge: "bg-blue-50 text-blue-700", column: "bg-blue-50/50" },
  { value: "interview", label: "Interview", badge: "bg-violet-50 text-violet-700", column: "bg-violet-50/50" },
  { value: "offer", label: "Offer", badge: "bg-emerald-50 text-emerald-700", column: "bg-emerald-50/50" },
  { value: "rejected", label: "Rejected", badge: "bg-rose-50 text-rose-700", column: "bg-rose-50/50" },
];

const lines = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean);
const words = (text: string) => text.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);

/** A spreadsheet (CSV) of the jobs, with a byte-order mark so Excel shows Bangla correctly. */
function downloadCsv(jobs: JobApplication[], mySkills: string[], today: string) {
  const cell = (value: string | number | null) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const head = ["Title", "Company", "Location", "Status", "Last date to apply", "Applied on", "Match %", "Skills", "Missing skills", "Link", "Notes"];
  const rows = jobs.map((j) => [j.title, j.company, j.location, j.status, j.deadline, j.applied_on, matchPercent(j.skills, mySkills), j.skills.join("; "), skillMatch(j.skills, mySkills).missing.join("; "), j.url, j.notes]);
  const csv = `﻿${[head, ...rows].map((r) => r.map(cell).join(",")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  Object.assign(document.createElement("a"), { href: url, download: `job-applications-${today}.csv` }).click();
  URL.revokeObjectURL(url);
}

export function JobsView() {
  const { data, error, mutate } = useSWR<List<JobApplication>>("/jobs");
  const { data: profile, mutate: mutateProfile } = useSWR<Profile>("/profile");
  const { data: library } = useSWR<{ items: LearningResource[] }>("/resources");
  const { toast, confirm } = useFeedback();
  const [editing, setEditing] = useState<JobApplication | "new" | null>(null);
  const [view, setView] = useState<"list" | "board">("list");
  const [learning, setLearning] = useState<Set<string>>(new Set());
  const [librarying, setLibrarying] = useState<Set<string>>(new Set());
  useNewAction(() => setEditing("new"));

  if (error && !data) return <LoadError error={error} retry={() => mutate()} />;
  if (!data || !profile) return <PageSkeleton />;

  const today = data.today!;
  const jobs = data.items;
  const mySkills = profile.skills ?? [];
  const toLearn = skillsToLearn(jobs, mySkills, today);
  const open = jobs.filter((j) => isOpen(j, today));
  const closed = jobs.filter((j) => !isOpen(j, today));
  const count = (status: JobStatus) => jobs.filter((j) => j.status === status).length;
  const closingSoon = jobs.filter((j) => j.status === "saved" && j.deadline && j.deadline >= today && daysBetween(today, j.deadline) <= 7).length;

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
    const extra = changes.status === "applied" && !job.applied_on ? { applied_on: today } : {};
    await mutate((current) => current && { ...current, items: current.items.map((j) => (j.id === job.id ? { ...j, ...changes, ...extra } : j)) }, { revalidate: false });
    try {
      await api(`/jobs/${job.id}`, { method: "PATCH", body: changes });
    } catch (e) {
      toast(errorMessage(e), "error");
    }
    await refresh("/jobs", "/events");
  };

  const remove = async (job: JobApplication) => {
    if (!(await confirm({ title: "Delete this job?", message: toArchive(`“${job.title}”`) }))) return;
    await mutate((current) => current && { ...current, items: current.items.filter((j) => j.id !== job.id) }, { revalidate: false });
    try {
      await api(`/jobs/${job.id}`, { method: "DELETE" });
      toast("Job moved to the Archive");
    } catch (e) {
      toast(errorMessage(e), "error");
    }
    await refresh("/jobs", "/events");
  };

  // Courses and playlists in your Learning library that teach a skill you still lack: "you already planned this".
  const planned = new Map<string, string>();
  for (const r of library?.items ?? []) {
    if (r.status === "todo" || r.status === "learning") for (const skill of r.skills) if (!planned.has(skillKey(skill))) planned.set(skillKey(skill), r.title);
  }

  // Adds the skill to the Learning library (a certificate course or playlist to find and complete), due by the nearest last date.
  const addToLibrary = async (item: { skill: string; jobs: string[]; by: string | null }) => {
    setLibrarying((set) => new Set(set).add(item.skill));
    try {
      await api("/resources", { method: "POST", body: { title: `Learn ${item.skill}`, kind: "certificate", skills: [item.skill], ...(item.by ? { due_date: item.by } : {}), notes: `Needed for: ${item.jobs.join(", ")}`.slice(0, 2000), priority: "high" } });
      await refresh("/resources");
      toast(`Added “Learn ${item.skill}” to your Learning library. Open it there to add a course link.`);
    } catch (e) {
      setLibrarying((set) => {
        const next = new Set(set);
        next.delete(item.skill);
        return next;
      });
      toast(errorMessage(e), "error");
    }
  };

  // One click turns a missing skill into a task, due by the earliest last date among the jobs that ask for it.
  const learnSkill = async (item: { skill: string; jobs: string[]; by: string | null }) => {
    setLearning((set) => new Set(set).add(item.skill));
    try {
      await api("/tasks", { method: "POST", body: { title: `Learn ${item.skill}`, ...(item.by ? { due_date: item.by } : {}), notes: `Needed for: ${item.jobs.join(", ")}`.slice(0, 2000), priority: "medium" } });
      await refresh("/tasks");
      toast(`Task added: Learn ${item.skill}${item.by ? ` (due ${formatDate(item.by, "short")})` : ""}`);
    } catch (e) {
      setLearning((set) => {
        const next = new Set(set);
        next.delete(item.skill);
        return next;
      });
      toast(errorMessage(e), "error");
    }
  };

  const card = (job: JobApplication) => (
    <JobCard key={job.id} job={job} today={today} mySkills={mySkills} onChange={(c) => update(job, c)} onEdit={() => setEditing(job)} onDelete={() => remove(job)} onLearned={(skill) => saveSkills([...mySkills, skill])} />
  );

  return (
    <>
      <PageHeader title="Job Apply" description="Save job links, track the last date to apply, and see which skills to learn.">
        {jobs.length > 0 && (
          <button type="button" className="btn btn-secondary" onClick={() => downloadCsv(jobs, mySkills, today)}>
            <Download className="size-4" />
            <span className="hidden sm:inline">Export</span>
          </button>
        )}
        <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
          <Plus className="size-4" />
          Add Job
        </button>
      </PageHeader>

      {jobs.length > 0 && (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <Stat label="Saved" value={count("saved")} tone="text-slate-800" />
          <Stat label="Applied" value={count("applied")} tone="text-blue-600" />
          <Stat label="Interviews" value={count("interview")} tone="text-violet-600" />
          <Stat label="Offers" value={count("offer")} tone="text-emerald-600" />
          <Stat label="Rejected" value={count("rejected")} tone="text-rose-600" />
          <Stat label="Closing in 7 days" value={closingSoon} tone={closingSoon ? "text-amber-600" : "text-slate-400"} />
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">
          {jobs.length > 0 && (
            <Segmented
              label="View"
              value={view}
              onChange={setView}
              options={[
                { value: "list", label: <span className="inline-flex items-center gap-1.5"><ListIcon className="size-4" />List</span> },
                { value: "board", label: <span className="inline-flex items-center gap-1.5"><LayoutGrid className="size-4" />Board</span> },
              ]}
            />
          )}
          {jobs.length === 0 ? (
            <EmptyState icon={BriefcaseBusiness} title="No jobs saved yet" text="Paste a job link: the last date to apply, the requirements and the skills are filled in for you to check.">
              <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
                <Plus className="size-4" />
                Add your first job
              </button>
            </EmptyState>
          ) : view === "list" ? (
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
            <Board jobs={jobs} today={today} mySkills={mySkills} onMove={(job, status) => update(job, { status })} onOpen={setEditing} />
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
              <ol className="mt-4 space-y-3">
                {toLearn.slice(0, 15).map((s) => (
                  <li key={skillKey(s.skill)} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800">
                        {s.skill} <span className="ml-1 text-xs font-normal text-violet-600">{s.jobs.length} {s.jobs.length === 1 ? "job" : "jobs"}</span>
                      </p>
                      <p className="truncate text-xs text-slate-400" title={s.jobs.join(", ")}>{s.jobs.join(", ")}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-stretch gap-1.5">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={learning.has(s.skill)}
                        onClick={() => learnSkill(s)}
                        title={s.by ? `Adds a task due ${formatDate(s.by, "short")}, the nearest last date` : "Adds a task"}
                      >
                        {learning.has(s.skill) ? <><Check className="size-3.5" />Added</> : <><Plus className="size-3.5" />Task</>}
                      </button>
                      {planned.has(skillKey(s.skill)) ? (
                        <span className="text-center text-[11px] font-medium text-emerald-700" title={planned.get(skillKey(s.skill))}>In your library</span>
                      ) : (
                        <button type="button" className="btn btn-ghost btn-sm" disabled={librarying.has(s.skill)} onClick={() => addToLibrary(s)} title="Adds a course to find and complete in Learning → Certificates & playlists">
                          {librarying.has(s.skill) ? <><Check className="size-3.5" />Added</> : <><GraduationCap className="size-3.5" />Library</>}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-4 text-sm text-slate-500">{open.length ? "You have every skill your open jobs ask for. 🎉" : "Add a job to see what to learn."}</p>
            )}
          </section>
        </aside>
      </div>

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Add a job" : "Edit job"} description={editing === "new" ? "Read a link to fill the form, or type it in yourself." : undefined} size="lg">
        {editing && <JobForm key={editing === "new" ? "new" : editing.id} job={editing === "new" ? null : editing} today={today} onClose={() => setEditing(null)} />}
      </Modal>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-0.5 text-2xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}

function daysTone(deadline: string | null, today: string) {
  if (!deadline) return "bg-slate-100 text-slate-500";
  const days = daysBetween(today, deadline);
  return days < 0 ? "bg-slate-100 text-slate-500" : days <= 3 ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700";
}

function StatusSelect({ status, onChange }: { status: JobStatus; onChange: (status: JobStatus) => void }) {
  const current = STATUSES.find((s) => s.value === status) ?? STATUSES[0];
  return (
    <select aria-label="Status" className={`rounded-lg border-0 py-2 pl-2 pr-7 text-xs font-semibold ${current.badge}`} value={status} onChange={(e) => onChange(e.target.value as JobStatus)}>
      {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
    </select>
  );
}

function JobCard({ job, today, mySkills, onChange, onEdit, onDelete, onLearned }: {
  job: JobApplication; today: string; mySkills: string[];
  onChange: (changes: Partial<JobApplication>) => void; onEdit: () => void; onDelete: () => void; onLearned: (skill: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { have, percent } = skillMatch(job.skills, mySkills);
  const haveKeys = new Set(have.map(skillKey));
  const label = deadlineLabel(job.deadline, today);

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
        <div className="flex flex-wrap items-center gap-2">
          {job.deadline ? (
            <span className={`badge ${job.status === "saved" ? daysTone(job.deadline, today) : "bg-slate-100 text-slate-500"}`} title={`Last date to apply: ${formatDate(job.deadline, "date")}`}>
              <CalendarClock className="mr-1 size-3.5" />
              {formatDate(job.deadline, "short")}{job.status === "saved" && ` · ${label}`}
            </span>
          ) : (
            <span className="badge bg-slate-100 text-slate-500">No deadline given</span>
          )}
          <StatusSelect status={job.status} onChange={(status) => onChange({ status })} />
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
                <li key={skill} className="badge max-w-full whitespace-normal bg-emerald-50 text-left text-emerald-700">✓ {skill}</li>
              ) : (
                <li key={skill}>
                  <button type="button" className="badge max-w-full whitespace-normal bg-rose-50 text-left text-rose-700 transition hover:bg-rose-100" title="Click when you have learned it" onClick={() => onLearned(skill)}>
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
        <span className="ml-auto flex gap-1">
          <button type="button" className="btn btn-ghost btn-sm btn-icon text-slate-400 hover:text-blue-600" onClick={onEdit} aria-label="Edit job">
            <Pencil className="size-4" />
          </button>
          <button type="button" className="btn btn-ghost btn-sm btn-icon text-slate-400 hover:text-rose-600" onClick={onDelete} aria-label="Delete job">
            <Trash2 className="size-4" />
          </button>
        </span>
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
        </div>
      )}
    </article>
  );
}

/** The five stages side by side. Drag a card to another column (or use its menu on a phone). */
function Board({ jobs, today, mySkills, onMove, onOpen }: { jobs: JobApplication[]; today: string; mySkills: string[]; onMove: (job: JobApplication, status: JobStatus) => void; onOpen: (job: JobApplication) => void }) {
  const [over, setOver] = useState<JobStatus | null>(null);

  const drop = (e: DragEvent, status: JobStatus) => {
    e.preventDefault();
    setOver(null);
    const job = jobs.find((j) => j.id === e.dataTransfer.getData("text/plain"));
    if (job && job.status !== status) onMove(job, status);
  };

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
      {STATUSES.map((column) => {
        const items = jobs.filter((j) => j.status === column.value);
        return (
          <section
            key={column.value}
            aria-label={column.label}
            onDragOver={(e) => { e.preventDefault(); setOver(column.value); }}
            onDragLeave={() => setOver((current) => (current === column.value ? null : current))}
            onDrop={(e) => drop(e, column.value)}
            className={`min-h-32 rounded-2xl p-2.5 ring-1 transition ${column.column} ${over === column.value ? "ring-2 ring-blue-300" : "ring-slate-200/70"}`}
          >
            <h3 className="mb-2 flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {column.label}
              <span className="rounded-full bg-white px-2 py-0.5 text-[11px] text-slate-600 ring-1 ring-slate-200">{items.length}</span>
            </h3>
            <ul className="space-y-2">
              {items.map((job) => {
                const percent = matchPercent(job.skills, mySkills);
                const closed = !isOpen(job, today);
                return (
                  <li key={job.id}>
                    <article
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", job.id)}
                      className={`cursor-grab rounded-xl bg-white p-3 text-left shadow-sm ring-1 ring-slate-200/70 active:cursor-grabbing ${closed ? "opacity-60" : ""}`}
                    >
                      <button type="button" className="block w-full text-left" onClick={() => onOpen(job)}>
                        <span className="block text-sm font-semibold text-slate-900">{job.title}</span>
                        {job.company && <span className="block truncate text-xs text-slate-500">{job.company}</span>}
                      </button>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {job.deadline && job.status === "saved" && <span className={`badge ${daysTone(job.deadline, today)}`}>{job.deadline < today ? "Closed" : deadlineLabel(job.deadline, today)}</span>}
                        {job.skills.length > 0 && <span className="badge bg-slate-100 text-slate-600">{percent}% match</span>}
                      </div>
                      <div className="mt-2 md:hidden">
                        <StatusSelect status={job.status} onChange={(status) => onMove(job, status)} />
                      </div>
                    </article>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function SkillsCard({ skills, onSave }: { skills: string[]; onSave: (skills: string[]) => void }) {
  const [text, setText] = useState("");
  const add = (e: FormEvent) => {
    e.preventDefault();
    // "React, SQL, Docker" adds three at once.
    const { skills: all, added } = mergeSkills(skills, words(text));
    setText("");
    if (added.length) onSave(all);
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
            <li key={skill} className="badge max-w-full gap-1 whitespace-normal bg-emerald-50 text-left text-emerald-700">
              {skill}
              <button type="button" className="rounded-full p-1.5 hover:bg-emerald-100" aria-label={`Remove ${skill}`} onClick={() => onSave(skills.filter((s) => s !== skill))}>
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

/** Add or edit a job. "Read link" fills the fields; every field can be typed or corrected by hand. */
function JobForm({ job, today, onClose }: { job: JobApplication | null; today: string; onClose: () => void }) {
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [hints, setHints] = useState<string[]>([]);
  const [paste, setPaste] = useState(false);
  const [post, setPost] = useState("");
  const [f, setF] = useState({
    url: job?.url ?? "",
    title: job?.title ?? "",
    company: job?.company ?? "",
    location: job?.location ?? "",
    deadline: job?.deadline ?? "",
    status: (job?.status ?? "saved") as JobStatus,
    skills: (job?.skills ?? []).join(", "),
    requirements: (job?.requirements ?? []).join("\n"),
    summary: job?.summary ?? "",
    notes: job?.notes ?? "",
  });
  const set = (key: keyof typeof f) => (e: { target: { value: string } }) => setF((current) => ({ ...current, [key]: e.target.value }));

  const read = async (source: { url: string } | { text: string }) => {
    setReading(true);
    setError("");
    setHints([]);
    try {
      const a = await api<JobAnalysis>("/jobs/analyze", { method: "POST", body: source });
      setF((c) => ({
        ...c,
        title: a.title || c.title,
        company: a.company || c.company,
        location: a.location || c.location,
        deadline: a.deadline || c.deadline,
        summary: a.summary || c.summary,
        skills: a.skills.length ? a.skills.join(", ") : c.skills,
        requirements: a.requirements.length ? a.requirements.join("\n") : c.requirements,
      }));
      setHints(a.hints);
    } catch (e) {
      setError(errorMessage(e));
      // A site that blocks reading: offer the paste box right away.
      setPaste(true);
    } finally {
      setReading(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const url = fixLink(f.url);
    if (url && !/^https?:\/\/\S+$/i.test(url)) return setError("The link should start with https://");
    if (!f.title.trim()) return setError("Add the job title.");
    setBusy(true);
    setError("");
    const body = {
      url,
      title: f.title.trim(),
      company: f.company.trim(),
      location: f.location.trim(),
      deadline: f.deadline || null,
      status: f.status,
      skills: words(f.skills),
      requirements: lines(f.requirements),
      summary: f.summary.trim(),
      notes: f.notes.trim(),
    };
    try {
      if (job) {
        await api(`/jobs/${job.id}`, { method: "PATCH", body });
      } else {
        await api("/jobs", { method: "POST", body: { ...body, ...(f.status === "applied" ? { applied_on: today } : {}) } });
      }
      await refresh("/jobs", "/events");
      toast(job ? "Job updated" : `Saved “${body.title}”${body.deadline ? ` · apply by ${formatDate(body.deadline, "short")}` : ""}`);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const inThePast = Boolean(f.deadline) && f.deadline < today;

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      {!job && (
        <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
          <label className="label" htmlFor="job-url">Job link</label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input id="job-url" className="input pl-9" value={f.url} onChange={set("url")} placeholder="https://jobs.bdjobs.com/…" autoFocus />
            </div>
            <button type="button" className="btn btn-secondary shrink-0 max-sm:w-full" disabled={reading || !f.url.trim()} onClick={() => read({ url: fixLink(f.url) })}>
              {reading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              Read link
            </button>
          </div>
          {paste ? (
            <div className="mt-3">
              <label className="label" htmlFor="job-text">Or paste the job post</label>
              <textarea id="job-text" className="input min-h-28" value={post} onChange={(e) => setPost(e.target.value)} maxLength={30000} placeholder="Copy the whole post here…" />
              <button type="button" className="btn btn-secondary btn-sm mt-2" disabled={reading || !post.trim()} onClick={() => read({ text: post })}>
                {reading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                Read text
              </button>
            </div>
          ) : (
            <button type="button" className="mt-2 text-sm font-medium text-blue-600 hover:text-blue-700" onClick={() => setPaste(true)}>
              The site needs a login? Paste the job text instead
            </button>
          )}
          {hints.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-amber-700">
              {hints.map((h) => <li key={h}>• {h}</li>)}
            </ul>
          )}
          {!reading && !hints.length && <p className="mt-2 text-xs text-slate-500">Or skip this and fill in the form by hand.</p>}
        </div>
      )}

      {job && (
        <Field label="Job link" htmlFor="job-url">
          <input id="job-url" className="input" value={f.url} onChange={set("url")} placeholder="https://…" />
        </Field>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Job title" htmlFor="job-title" className="sm:col-span-2">
          <input id="job-title" className="input" value={f.title} onChange={set("title")} maxLength={200} required />
        </Field>
        <Field label="Company" htmlFor="job-company">
          <input id="job-company" className="input" value={f.company} onChange={set("company")} maxLength={200} />
        </Field>
        <Field label="Location" htmlFor="job-location">
          <input id="job-location" className="input" value={f.location} onChange={set("location")} maxLength={200} placeholder="Dhaka, Remote…" />
        </Field>
        <Field label="Last date to apply" htmlFor="job-deadline" hint={inThePast ? "This date has already passed." : undefined}>
          <input id="job-deadline" type="date" className="input" value={f.deadline} onChange={set("deadline")} />
        </Field>
        <Field label="Status" htmlFor="job-status">
          <select id="job-status" className="input" value={f.status} onChange={set("status")}>
            {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </Field>
      </div>

      <Field label="Skills the job asks for" htmlFor="job-skills" hint="Separate with commas. They are compared with your skills.">
        <textarea id="job-skills" className="input min-h-16" value={f.skills} onChange={set("skills")} placeholder="React, TypeScript, SQL, Communication" />
      </Field>
      <Field label="Requirements" htmlFor="job-requirements" hint="One per line.">
        <textarea id="job-requirements" className="input min-h-24" value={f.requirements} onChange={set("requirements")} />
      </Field>
      <Field label="Summary" htmlFor="job-summary">
        <textarea id="job-summary" className="input min-h-16" value={f.summary} onChange={set("summary")} maxLength={2000} />
      </Field>
      <Field label="Your notes" htmlFor="job-notes">
        <textarea id="job-notes" className="input min-h-16" value={f.notes} onChange={set("notes")} maxLength={5000} placeholder="Contact person, documents to send, interview date…" />
      </Field>

      <ModalActions onCancel={onClose} submitLabel={job ? "Save changes" : "Add Job"} busy={busy} />
    </form>
  );
}
