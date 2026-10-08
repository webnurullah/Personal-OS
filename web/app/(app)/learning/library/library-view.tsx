"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { Award, Check, Copy, ExternalLink, GraduationCap, ListChecks, Plus, Search, Sparkles } from "lucide-react";
import { formatDate } from "@/lib/dates";
import { formatMoney, hm } from "@/lib/format";
import { compareUpNext, expiryLabel, hasCertificate, kindLabel, KINDS, libraryStats, resumeLine, upNext, WIP_LIMIT, certificateExpiry } from "@/lib/library";
import { skillKey } from "@/lib/jobs";
import { isHttpUrl } from "@/lib/projects";
import { useProfile } from "@/lib/profile";
import type { CourseSummary, LearningResource, ResourceKind } from "@/lib/types";
import { Segmented } from "@/components/ui/controls";
import { Modal } from "@/components/ui/modal";
import { EmptyState, LoadError, PageHeader, PageSkeleton } from "@/components/ui/states";
import { LearningTabs } from "../learning-tabs";
import { PasteList, StarterIdeas } from "./add-many";
import { CompleteDialog } from "./complete-dialog";
import { ResourceForm } from "./resource-form";
import { ResourceRow, Stars, useCopy, useResources } from "./shared";

type View = "todo" | "completed" | "certificates";

function Stat({ label, value, tone = "text-slate-800" }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="card px-4 py-3">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className={`mt-0.5 text-2xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}

const newest = (r: LearningResource) => r.completed_on ?? r.created_at.slice(0, 10);

export function LibraryView() {
  const { data, error, mutate } = useResources();
  const { data: courses } = useSWR<{ items: CourseSummary[] }>("/courses");
  const { profile } = useProfile();
  const copy = useCopy();
  const [view, setView] = useState<View>("todo");
  const [subject, setSubject] = useState("all"); // "all", "none" (no subject) or a course id
  const [kind, setKind] = useState<"all" | ResourceKind>("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<LearningResource | "new" | null>(null);
  const [adding, setAdding] = useState<"list" | "ideas" | null>(null);
  const [completing, setCompleting] = useState<LearningResource | null>(null);

  const items = useMemo(() => data?.items ?? [], [data]);
  const today = data?.today ?? "";
  const courseName = useMemo(() => new Map((courses?.items ?? []).map((c) => [c.id, c.title])), [courses]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(
      (r) =>
        (subject === "all" || (subject === "none" ? r.course_id === null : r.course_id === subject)) &&
        (kind === "all" || r.kind === kind) &&
        (!q || `${r.title} ${r.platform} ${r.provider} ${r.skills.join(" ")}`.toLowerCase().includes(q)),
    );
  }, [items, subject, kind, query]);

  if (error && !data) return <LoadError error={error} retry={() => mutate()} />;
  if (!data) return <PageSkeleton />;

  const stats = libraryStats(items);
  const open = visible.filter((r) => r.status === "todo" || r.status === "learning").sort(compareUpNext);
  const learning = open.filter((r) => r.status === "learning");
  const todo = open.filter((r) => r.status === "todo");
  const dropped = visible.filter((r) => r.status === "dropped");
  const completed = visible.filter((r) => r.status === "completed").sort((a, b) => newest(b).localeCompare(newest(a)));
  const certificates = visible.filter(hasCertificate).sort((a, b) => (b.issued_on ?? newest(b)).localeCompare(a.issued_on ?? newest(a)));
  const next = upNext(visible);
  const mySkills = new Set((profile?.skills ?? []).map(skillKey));
  const gained = new Map<string, number>();
  for (const r of items.filter((x) => x.status === "completed")) for (const s of r.skills) gained.set(s, (gained.get(s) ?? 0) + 1);

  const row = (r: LearningResource) => (
    <ResourceRow key={r.id} item={r} today={today} courseName={r.course_id ? courseName.get(r.course_id) : undefined} onEdit={() => setEditing(r)} onComplete={() => setCompleting(r)} />
  );

  const filtering = subject !== "all" || kind !== "all" || query.trim() !== "";

  return (
    <>
      <PageHeader title="Learning" description="Collect the courses and playlists you want to finish, and keep your certificates in one place.">
        <button type="button" className="btn btn-secondary" onClick={() => setAdding("ideas")}>
          <Sparkles className="size-4" />
          Ideas
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => setAdding("list")}>
          <ListChecks className="size-4" />
          Paste a list
        </button>
        <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
          <Plus className="size-4" />
          Add
        </button>
      </PageHeader>
      <LearningTabs current="library" />

      {items.length === 0 ? (
        <div className="card mt-5">
          <EmptyState icon={GraduationCap} title="Nothing in your library yet" text="Add a course or a YouTube playlist you want to complete: paste its link and the title is filled in. Or start from ideas for a subject like Digital Marketing.">
            <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
              <Plus className="size-4" /> Add a link
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setAdding("ideas")}>
              <Sparkles className="size-4" /> See ideas
            </button>
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <Stat label="To do" value={stats.todo} />
            <Stat label="Learning now" value={stats.learning} tone={stats.tooManyStarted ? "text-amber-600" : "text-blue-600"} />
            <Stat label="Completed" value={stats.completed} tone="text-emerald-600" />
            <Stat label="Certificates" value={stats.certificates} tone="text-amber-600" />
            <Stat label="Hours learned" value={hm(stats.hours)} tone="text-violet-600" />
            <Stat label="Spent" value={stats.spent ? formatMoney(stats.spent, profile?.currency) : "Free"} tone="text-slate-700" />
          </div>

          <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <Segmented
              label="Show"
              value={view}
              onChange={setView}
              options={[
                { value: "todo", label: `To do (${open.length})` },
                { value: "completed", label: `Completed (${completed.length})` },
                { value: "certificates", label: `Certificates (${certificates.length})` },
              ]}
            />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto] lg:w-auto lg:min-w-[34rem]">
              <div className="relative min-w-0">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input className="input pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the library" aria-label="Search the library" />
              </div>
              <select className="select" value={subject} onChange={(e) => setSubject(e.target.value)} aria-label="Subject">
                <option value="all">All subjects</option>
                {(courses?.items ?? []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                <option value="none">No subject</option>
              </select>
              <select className="select" value={kind} onChange={(e) => setKind(e.target.value as "all" | ResourceKind)} aria-label="Type">
                <option value="all">All types</option>
                {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_21rem]">
            <div className="min-w-0 space-y-4">
              {view === "todo" && (
                <>
                  {stats.tooManyStarted && (
                    <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-amber-100">
                      You have {stats.learning} things in progress (more than {WIP_LIMIT}). Finishing one before starting another is faster than juggling them all.
                    </p>
                  )}
                  {next.length > 0 && open.length > WIP_LIMIT && (
                    <section className="card p-4" aria-labelledby="next-title">
                      <h2 id="next-title" className="card-title">Up next</h2>
                      <ol className="mt-2 space-y-1.5 text-sm">
                        {next.map((r, i) => (
                          <li key={r.id} className="flex items-baseline gap-2">
                            <span className="font-semibold text-slate-400">{i + 1}.</span>
                            <button type="button" className="min-w-0 text-left font-medium text-slate-800 hover:text-blue-700" onClick={() => setEditing(r)}>{r.title}</button>
                            {r.status === "learning" && <span className="shrink-0 whitespace-nowrap text-xs text-blue-600">in progress</span>}
                          </li>
                        ))}
                      </ol>
                    </section>
                  )}
                  {open.length === 0 ? (
                    <div className="card">
                      <EmptyState icon={Check} title={filtering ? "Nothing matches" : "Nothing left to do"} text={filtering ? "Try a different subject, type or search." : "Everything you added is completed. Add the next course you want to take."} />
                    </div>
                  ) : (
                    <>
                      {learning.length > 0 && (
                        <>
                          <h2 className="text-sm font-semibold text-slate-500">Learning now ({learning.length})</h2>
                          <ul className="space-y-3">{learning.map(row)}</ul>
                        </>
                      )}
                      {todo.length > 0 && (
                        <>
                          <h2 className="pt-1 text-sm font-semibold text-slate-500">To do ({todo.length})</h2>
                          <ul className="space-y-3">{todo.map(row)}</ul>
                        </>
                      )}
                    </>
                  )}
                  {dropped.length > 0 && (
                    <details className="group">
                      <summary className="cursor-pointer text-sm font-semibold text-slate-500">Dropped ({dropped.length})</summary>
                      <ul className="mt-3 space-y-3">{dropped.map(row)}</ul>
                    </details>
                  )}
                </>
              )}

              {view === "completed" &&
                (completed.length ? (
                  <ul className="space-y-3">{completed.map(row)}</ul>
                ) : (
                  <div className="card">
                    <EmptyState icon={Check} title={filtering ? "Nothing matches" : "Nothing completed yet"} text="When you finish a course or playlist, mark it complete here to keep its certificate and add the skills to your profile." />
                  </div>
                ))}

              {view === "certificates" && (
                <>
                  {certificates.length > 1 && (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => copy(certificates.map(resumeLine).join("\n"), "All lines copied. Paste them into your CV or LinkedIn.")}>
                      <Copy className="size-4" /> Copy all for my CV
                    </button>
                  )}
                  {certificates.length ? (
                    <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      {certificates.map((r) => {
                        const expiry = certificateExpiry(r, today);
                        return (
                          <li key={r.id} className="card p-4">
                            <div className="flex items-start gap-3">
                              <span className="icon-tile size-10 shrink-0 bg-amber-50 text-amber-600"><Award className="size-5" /></span>
                              <div className="min-w-0 flex-1">
                                <button type="button" className="text-left font-semibold leading-snug text-slate-900 hover:text-blue-700" onClick={() => setEditing(r)}>{r.title}</button>
                                <p className="mt-0.5 text-xs text-slate-500">{[kindLabel(r.kind), r.platform || r.provider, (r.issued_on ?? r.completed_on) ? formatDate((r.issued_on ?? r.completed_on)!, "monthShort") : ""].filter(Boolean).join(" · ")}</p>
                                {r.certificate_id && <p className="mt-1 text-xs text-slate-500">ID: <span className="font-mono">{r.certificate_id}</span></p>}
                                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                  {expiry.state !== "none" && (
                                    <span className={`badge shrink-0 whitespace-nowrap ${expiry.state === "expired" ? "bg-rose-50 text-rose-700" : expiry.state === "soon" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{expiryLabel(r, today)}</span>
                                  )}
                                  <Stars value={r.rating} />
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {isHttpUrl(r.certificate_url) && (
                                    <a href={r.certificate_url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
                                      <ExternalLink className="size-3.5" /> View
                                    </a>
                                  )}
                                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy(resumeLine(r), "Line copied. Paste it into your CV or LinkedIn.")}>
                                    <Copy className="size-3.5" /> CV line
                                  </button>
                                </div>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <div className="card">
                      <EmptyState icon={Award} title={filtering ? "Nothing matches" : "No certificates yet"} text="When you complete a course, add its certificate link or ID and it appears here, with a reminder before it expires." />
                    </div>
                  )}
                </>
              )}
            </div>

            <aside className="space-y-5">
              <section className="card p-5" aria-labelledby="skills-title">
                <h2 id="skills-title" className="card-title flex items-center gap-2.5">
                  <span className="icon-tile size-8 bg-emerald-50 text-emerald-600"><Sparkles className="size-4.5" /></span>
                  Skills you gained
                </h2>
                {gained.size ? (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {[...gained].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([skill, n]) => (
                      <li key={skill} className="badge max-w-full whitespace-nowrap bg-emerald-50 px-2.5 py-1 text-emerald-800">
                        {skill}{n > 1 ? ` ×${n}` : ""}
                        {mySkills.has(skillKey(skill)) && <Check className="size-3" aria-label="in your skills" />}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">Skills of the courses you complete appear here, and can be added to the skills Job Apply uses.</p>
                )}
              </section>
            </aside>
          </div>
        </>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Add to library" : "Edit item"} size="lg">
        {editing !== null && <ResourceForm key={editing === "new" ? "new" : editing.id} item={editing === "new" ? null : editing} courseId={subject !== "all" && subject !== "none" ? subject : null} onClose={() => setEditing(null)} />}
      </Modal>
      <Modal open={adding === "list"} onClose={() => setAdding(null)} title="Paste a list" description="Add many courses or playlists at once." size="lg">
        {adding === "list" && <PasteList courseId={subject !== "all" && subject !== "none" ? subject : null} onClose={() => setAdding(null)} />}
      </Modal>
      <Modal open={adding === "ideas"} onClose={() => setAdding(null)} title="Ideas to start with" description="What people usually take for a subject." size="lg">
        {adding === "ideas" && (
          <StarterIdeas
            courseId={subject !== "all" && subject !== "none" ? subject : null}
            courseName={subject !== "all" && subject !== "none" ? courseName.get(subject) : undefined}
            onClose={() => setAdding(null)}
          />
        )}
      </Modal>
      <Modal open={completing !== null} onClose={() => setCompleting(null)} title="Make it count" description="Keep what you earned from finishing this." size="lg">
        {completing && <CompleteDialog item={completing} today={today} onClose={() => setCompleting(null)} />}
      </Modal>
    </>
  );
}
