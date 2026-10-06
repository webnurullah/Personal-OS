"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { FolderKanban, Plus, Trash2 } from "lucide-react";
import { colorOf } from "@/lib/colors";
import { plural } from "@/lib/format";
import { useNewAction } from "@/lib/new-action";
import { compareProjects, kindLabel, PROJECT_KINDS, PROJECT_STATUSES } from "@/lib/projects";
import type { List, Project, ProjectKind, ProjectStatus } from "@/lib/types";
import { Progress } from "@/components/ui/charts";
import { Segmented } from "@/components/ui/controls";
import { Modal } from "@/components/ui/modal";
import { EmptyState, LoadError, PageHeader, PageSkeleton } from "@/components/ui/states";
import { ProjectForm } from "./project-form";
import { KindIcon, refreshProjects, TimeBadge, useRemoveProject } from "./shared";

export function ProjectsView() {
  const router = useRouter();
  const { data, error, mutate } = useSWR<List<Project>>("/projects");
  const removeProject = useRemoveProject();
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<"all" | ProjectKind>("all");
  const [status, setStatus] = useState<ProjectStatus>("active");
  useNewAction(() => setAdding(true));

  if (error && !data) return <LoadError error={error} retry={() => mutate()} />;
  if (!data) return <PageSkeleton />;

  const projects = data.items;
  const active = projects.filter((p) => p.status === "active");
  const dueSoon = active.filter((p) => p.timeframe.days !== null && p.timeframe.days >= 0 && p.timeframe.days <= 7).length;
  const visible = projects.filter((p) => p.status === status && (kind === "all" || p.kind === kind)).sort(compareProjects);

  const remove = async (project: Project) => {
    if (!(await removeProject(project))) return;
    // Gone from the list at once, then everything that depended on it reloads.
    await mutate((current) => current && { ...current, items: current.items.filter((p) => p.id !== project.id) }, { revalidate: false });
    await refreshProjects();
  };

  return (
    <>
      <PageHeader title="Projects" description="Everything you are working on: websites, social media, personal branding and more.">
        <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
          <Plus className="size-4" />
          New Project
        </button>
      </PageHeader>

      {projects.length === 0 ? (
        <div className="card mt-6">
          <EmptyState icon={FolderKanban} title="No projects yet" text="Add a website you are building, a social media routine, or your personal brand. Projects can have a due date or run on and on.">
            <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
              <Plus className="size-4" />
              Add your first project
            </button>
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Stat label="Active" value={active.length} tone="text-slate-800" />
            <Stat label="Ongoing" value={active.filter((p) => !p.due_date).length} tone="text-sky-600" />
            <Stat label="Due in 7 days" value={dueSoon} tone={dueSoon ? "text-amber-600" : "text-slate-400"} />
            <Stat label="Overdue" value={active.filter((p) => p.timeframe.tone === "late").length} tone={active.some((p) => p.timeframe.tone === "late") ? "text-rose-600" : "text-slate-400"} />
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Segmented label="Type" value={kind} onChange={setKind} options={[{ value: "all" as const, label: "All" }, ...PROJECT_KINDS.map((k) => ({ value: k.value, label: k.label }))]} />
            <Segmented label="Status" value={status} onChange={setStatus} options={PROJECT_STATUSES.map((s) => ({ value: s.value, label: `${s.label} (${projects.filter((p) => p.status === s.value).length})` }))} />
          </div>

          {visible.length ? (
            <ul className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visible.map((project) => {
                const color = colorOf(project.color);
                return (
                  <li key={project.id} className="card relative transition hover:shadow-md">
                    <Link href={`/projects/${project.id}`} className="block rounded-2xl p-5 pr-14 focus-visible:outline-2 focus-visible:outline-blue-400">
                      <span className="flex items-start gap-3">
                        <span className={`icon-tile size-10 shrink-0 ${color.tile}`}>
                          <KindIcon kind={project.kind} className="size-5" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-base font-semibold text-slate-900">{project.name}</span>
                          <span className="block truncate text-sm text-slate-500">{project.client || "Your own project"} · {kindLabel(project.kind)}</span>
                        </span>
                      </span>
                      <span className="mt-3 flex flex-wrap items-center gap-1.5">
                        <TimeBadge timeframe={project.timeframe} />
                        {project.status === "paused" && <span className="badge bg-slate-100 text-slate-500">Paused</span>}
                      </span>
                      {project.goal && <span className="mt-3 block truncate text-sm text-slate-600">{project.goal}</span>}
                      <span className="mt-4 block">
                        {project.due_date && project.tasks_total > 0 ? (
                          <span className="flex items-center gap-3">
                            <Progress value={project.percent} fill={color.bar} track="bg-slate-100" className="h-1.5 flex-1" />
                            <span className="text-xs font-semibold text-slate-600">{project.percent}%</span>
                          </span>
                        ) : null}
                        <span className="mt-1.5 block text-xs text-slate-500">
                          {project.tasks_total === 0 ? "No tasks yet" : project.due_date ? `${project.tasks_done} of ${plural(project.tasks_total, "task")} done` : `${project.tasks_open} open · ${project.tasks_done} done`}
                        </span>
                      </span>
                    </Link>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm btn-icon absolute right-3 top-3 text-slate-400 hover:text-rose-600"
                      onClick={() => remove(project)}
                      aria-label={`Delete ${project.name}`}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-4 rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
              No {status} projects{kind === "all" ? "" : ` of this type`}.
            </p>
          )}
        </>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title="New project" description="Start with a name. Everything else can wait." size="lg">
        {adding && <ProjectForm project={null} onClose={() => setAdding(false)} onSaved={(saved) => router.push(`/projects/${saved.id}`)} />}
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
