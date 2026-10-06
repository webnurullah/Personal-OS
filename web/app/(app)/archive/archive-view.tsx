"use client";

import Link from "next/link";
import useSWR from "swr";
import { Archive, RotateCcw, Trash2 } from "lucide-react";
import { colorOf } from "@/lib/colors";
import { formatDate } from "@/lib/dates";
import { plural } from "@/lib/format";
import { kindLabel } from "@/lib/projects";
import type { List, Project } from "@/lib/types";
import { EmptyState, LoadError, PageHeader, PageSkeleton } from "@/components/ui/states";
import { KindIcon, refreshProjects, useProjectActions } from "../projects/shared";

/** Projects you have archived. From here a project can be restored, or deleted for good. */
export function ArchiveView() {
  const { data, error, mutate } = useSWR<List<Project>>("/projects?archived=1");
  const { restore, deleteForever } = useProjectActions();

  if (error && !data) return <LoadError error={error} retry={() => mutate()} />;
  if (!data) return <PageSkeleton />;

  const leave = (project: Project) => mutate((current) => current && { ...current, items: current.items.filter((p) => p.id !== project.id) }, { revalidate: false });

  const bringBack = async (project: Project) => {
    await leave(project);
    await restore(project);
    await refreshProjects();
  };

  const deleteIt = async (project: Project) => {
    if (!(await deleteForever(project))) return;
    await leave(project);
    await refreshProjects();
  };

  return (
    <>
      <PageHeader title="Archive" description="Projects you have archived. Restore one to bring it back, or delete it for good." />

      {data.items.length === 0 ? (
        <div className="card mt-6">
          <EmptyState icon={Archive} title="The Archive is empty" text="When you archive a project it moves here. Nothing is deleted until you delete it from this page.">
            <Link href="/projects" className="btn btn-secondary">Go to Projects</Link>
          </EmptyState>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {data.items.map((project) => (
            <li key={project.id} className="card flex flex-wrap items-center gap-4 p-4 sm:px-5">
              <span className={`icon-tile size-10 shrink-0 ${colorOf(project.color).tile}`}>
                <KindIcon kind={project.kind} className="size-5" />
              </span>
              <div className="min-w-0 flex-1 basis-48">
                <p className="truncate font-semibold text-slate-900">{project.name}</p>
                <p className="truncate text-sm text-slate-500">
                  {project.client || "Your own project"} · {kindLabel(project.kind)}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">
                  Archived {project.archived_at ? formatDate(project.archived_at.slice(0, 10), "short") : ""} ·{" "}
                  {project.tasks_total ? `${plural(project.tasks_total, "task")} (${project.tasks_done} done)` : "no tasks"}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => bringBack(project)}>
                  <RotateCcw className="size-4" />
                  Restore
                </button>
                <button type="button" className="btn btn-sm text-rose-600 hover:bg-rose-50" onClick={() => deleteIt(project)} aria-label={`Delete ${project.name} for good`}>
                  <Trash2 className="size-4" />
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-6 text-xs text-slate-400">Archiving keeps a project&apos;s tasks in your Tasks list. Deleting a project from here also deletes its tasks.</p>
    </>
  );
}
