"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Archive, ChevronDown, ChevronLeft, CircleCheck, ExternalLink, FolderKanban, Link2, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { api, ApiError, errorMessage, refresh } from "@/lib/api";
import { colorOf } from "@/lib/colors";
import { formatDate } from "@/lib/dates";
import { plural } from "@/lib/format";
import { isHttpUrl, kindLabel, progress, timeframe } from "@/lib/projects";
import { taskDateLabel } from "@/lib/tasks";
import type { ProjectDetail, ProjectStatus, Task } from "@/lib/types";
import { Progress } from "@/components/ui/charts";
import { Field } from "@/components/ui/controls";
import { useFeedback } from "@/components/ui/feedback";
import { Modal } from "@/components/ui/modal";
import { EmptyState, LoadError, PageSkeleton } from "@/components/ui/states";
import { ProjectForm } from "../project-form";
import { forgetProject, KindIcon, refreshProjects, TimeBadge, useProjectActions } from "../shared";

/** The project's task counts after `done` more finished and `total` more tasks (the page updates before the server answers). */
function recount(project: ProjectDetail["project"], done: number, total: number): ProjectDetail["project"] {
  const tasks_total = project.tasks_total + total;
  const tasks_done = project.tasks_done + done;
  return { ...project, tasks_total, tasks_done, tasks_open: tasks_total - tasks_done, percent: progress(tasks_done, tasks_total) };
}

export function ProjectView({ id }: { id: string }) {
  const router = useRouter();
  const { data, error, mutate } = useSWR<ProjectDetail>(`/projects/${id}`);
  const { toast } = useFeedback();
  const { archive, restore, deleteForever } = useProjectActions();
  const [editing, setEditing] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [title, setTitle] = useState("");
  const [gone, setGone] = useState(false);

  if (gone) return <PageSkeleton />;
  // Even with a saved copy on screen: if the server says it is gone, show that (not the old page with buttons that fail).
  if (error instanceof ApiError && (error.status === 404 || error.status === 400)) {
    return (
      <div className="card mt-6">
        <EmptyState icon={FolderKanban} title="Project not found" text="It may have been deleted.">
          <Link href="/projects" className="btn btn-secondary">Back to Projects</Link>
        </EmptyState>
      </div>
    );
  }
  if (error && !data) return <LoadError error={error} retry={() => mutate()} />;
  if (!data) return <PageSkeleton />;

  const { project, tasks, today } = data;
  const color = colorOf(project.color);
  const open = tasks.filter((t) => !t.done_at);
  const done = tasks.filter((t) => t.done_at);
  const ongoing = !project.due_date;
  const archived = Boolean(project.archived_at);

  const toggle = async (task: Task) => {
    const becomingDone = !task.done_at;
    const done_at = becomingDone ? new Date().toISOString() : null;
    await mutate((cur) => cur && { ...cur, tasks: cur.tasks.map((t) => (t.id === task.id ? { ...t, done_at } : t)), project: recount(cur.project, becomingDone ? 1 : -1, 0) }, { revalidate: false });
    try {
      await api(`/tasks/${task.id}`, { method: "PATCH", body: { done: becomingDone } });
    } catch (e) {
      toast(errorMessage(e), "error");
    }
    await refresh("/projects", "/tasks");
  };

  const addTask = async (e: FormEvent) => {
    e.preventDefault();
    const text = title.trim();
    if (!text) return;
    setTitle("");
    try {
      const task = await api<Task>("/tasks", { method: "POST", body: { title: text, project_id: id } });
      await mutate((cur) => cur && { ...cur, tasks: [task, ...cur.tasks], project: recount(cur.project, 0, 1) }, { revalidate: false });
      await refresh("/projects", "/tasks");
    } catch (err) {
      setTitle(text);
      toast(errorMessage(err), "error");
    }
  };

  const setStatus = async (status: ProjectStatus) => {
    await mutate((cur) => cur && { ...cur, project: { ...cur.project, status, timeframe: timeframe({ ...cur.project, status }, cur.today) } }, { revalidate: false });
    try {
      await api(`/projects/${id}`, { method: "PATCH", body: { status } });
      toast(status === "done" ? "Marked as done. Nice work!" : "Project is active again");
    } catch (e) {
      toast(errorMessage(e), "error");
    }
    await refreshProjects();
  };

  const saveNotes = async (notes: string) => {
    if (notes === project.notes) return;
    await mutate((cur) => cur && { ...cur, project: { ...cur.project, notes } }, { revalidate: false });
    try {
      await api(`/projects/${id}`, { method: "PATCH", body: { notes } });
    } catch (e) {
      toast(errorMessage(e), "error");
    }
    await refresh("/projects");
  };

  // Archive: reversible, so it needs no question. The page shows a placeholder while leaving, so it does not
  // briefly reload a project that is no longer in the list.
  const archiveIt = async () => {
    setEditing(false);
    if (!(await archive(project))) return;
    setGone(true);
    router.push("/projects");
    await refreshProjects();
  };

  const restoreIt = async () => {
    if (!(await restore(project))) return;
    await mutate((cur) => cur && { ...cur, project: { ...cur.project, archived_at: null } }, { revalidate: false });
    await refreshProjects();
  };

  const deleteIt = async () => {
    if (!(await deleteForever(project))) return;
    forgetProject(project.id);
    setGone(true);
    router.push("/archive");
    await refreshProjects();
  };

  const taskRow = (task: Task) => (
    <li key={task.id} className="flex items-center gap-3 py-2.5">
      <input id={`pt-${task.id}`} type="checkbox" className="checkbox peer" checked={Boolean(task.done_at)} onChange={() => toggle(task)} />
      <label htmlFor={`pt-${task.id}`} className="min-w-0 flex-1 text-sm text-slate-700 peer-checked:text-slate-400 peer-checked:line-through">
        {task.title}
      </label>
      {task.due_date && !task.done_at && <span className="whitespace-nowrap text-xs text-slate-400">{taskDateLabel(task, today)}</span>}
    </li>
  );

  return (
    <>
      <Link href="/projects" className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800">
        <ChevronLeft className="size-4" />
        Projects
      </Link>

      {archived && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-100">
          <span>
            This project is in the Archive{project.archived_at ? ` (since ${formatDate(project.archived_on ?? project.archived_at.slice(0, 10), "short")})` : ""}.
          </span>
          <span className="flex gap-2">
            <button type="button" className="btn btn-secondary btn-sm" onClick={restoreIt}>
              <RotateCcw className="size-4" />
              Restore
            </button>
            <button type="button" className="btn btn-sm text-rose-600 hover:bg-rose-50" onClick={deleteIt}>
              <Trash2 className="size-4" />
              Delete for good
            </button>
          </span>
        </div>
      )}

      <header className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <span className={`icon-tile size-14 shrink-0 ${color.tile}`}>
            <KindIcon kind={project.kind} className="size-7" />
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 [overflow-wrap:anywhere] sm:text-3xl">{project.name}</h1>
            <p className="mt-1 text-slate-500 [overflow-wrap:anywhere]">
              {project.client || "Your own project"} · {kindLabel(project.kind)}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <TimeBadge timeframe={project.timeframe} />
              {project.status === "paused" && <span className="badge bg-slate-100 text-slate-500">Paused</span>}
            </div>
            {project.goal && <p className="mt-3 max-w-2xl text-slate-700 [overflow-wrap:anywhere]">{project.goal}</p>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!archived &&
            (project.status === "done" ? (
              <button type="button" className="btn btn-secondary" onClick={() => setStatus("active")}>
                <RotateCcw className="size-4" />
                Reopen
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={() => setStatus("done")}>
                <CircleCheck className="size-4" />
                Mark done
              </button>
            ))}
          <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>
            <Pencil className="size-4" />
            Edit
          </button>
          {!archived && (
            <button type="button" className="btn btn-secondary" onClick={archiveIt} title="Move to the Archive">
              <Archive className="size-4" />
              Archive
            </button>
          )}
        </div>
      </header>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <section className="card p-5">
          <p className="text-xs font-medium text-slate-500">Tasks</p>
          <p className="mt-0.5 text-2xl font-bold text-slate-900">
            {project.tasks_done} <span className="text-base font-medium text-slate-400">of {project.tasks_total} done</span>
          </p>
          {ongoing || project.tasks_total === 0 ? (
            <p className="mt-2 text-sm text-slate-500">{project.tasks_total === 0 ? "Add the first task below." : `${project.tasks_open} open · ${project.tasks_done} done`}</p>
          ) : (
            <div className="mt-3 flex items-center gap-3">
              <Progress value={project.percent} fill={color.bar} track="bg-slate-100" className="h-2 flex-1" />
              <span className="text-xs font-semibold text-slate-600">{project.percent}%</span>
            </div>
          )}
        </section>
        <section className="card p-5">
          <p className="text-xs font-medium text-slate-500">Timeframe</p>
          <p className="mt-0.5 text-2xl font-bold text-slate-900">{project.timeframe.label}</p>
          <p className="mt-2 text-sm text-slate-500">
            {project.start_date ? `${project.start_date > today ? "Starts" : "Started"} ${formatDate(project.start_date, "short")}` : `Added ${formatDate(project.created_on ?? project.created_at.slice(0, 10), "short")}`}
            {project.due_date ? ` · Due ${formatDate(project.due_date, "short")}` : " · No due date"}
          </p>
        </section>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="card p-5">
          <h2 className="card-title">Tasks</h2>
          <form onSubmit={addTask} className="mt-4">
            <label className="flex items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-2.5 transition focus-within:border-blue-300 focus-within:bg-blue-50/40">
              <Plus className="size-4 shrink-0 text-slate-400" />
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Add a task to this project…" className="min-w-0 flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400" aria-label="New task" />
            </label>
          </form>
          {open.length ? (
            <ul className="mt-2 divide-y divide-slate-100">{open.map(taskRow)}</ul>
          ) : (
            <p className="py-6 text-center text-sm text-slate-500">{done.length ? "Everything is done. 🎉" : "No tasks yet. Add the first step above."}</p>
          )}
          {done.length > 0 && (
            <>
              <button type="button" className="btn btn-ghost btn-sm mt-2" onClick={() => setShowDone((v) => !v)} aria-expanded={showDone}>
                <ChevronDown className={`size-4 transition ${showDone ? "rotate-180" : ""}`} />
                Done ({project.tasks_done})
              </button>
              {showDone && <ul className="mt-1 divide-y divide-slate-100">{done.map(taskRow)}</ul>}
            </>
          )}
          <p className="mt-4 text-xs text-slate-400">
            These are your normal tasks, so they also show on the <Link href="/tasks" className="font-medium text-blue-600">Tasks</Link> page{project.tasks_total ? ` (${plural(project.tasks_total, "task")} in this project)` : ""}.
          </p>
        </section>

        <aside className="space-y-5">
          <section className="card p-5">
            <h2 className="card-title flex items-center gap-2.5">
              <span className="icon-tile size-8 bg-blue-50 text-blue-600"><Link2 className="size-4.5" /></span>
              Links
            </h2>
            {project.links.length ? (
              <ul className="mt-3 divide-y divide-slate-100">
                {project.links.map((link, i) => (
                  <li key={i}>
                    {isHttpUrl(link.url) ? (
                      <a href={link.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between gap-3 py-2.5 text-sm font-medium text-blue-600 hover:text-blue-700">
                        <span className="min-w-0 truncate">{link.label}</span>
                        <ExternalLink className="size-4 shrink-0" />
                      </a>
                    ) : (
                      <span className="block py-2.5 text-sm text-slate-400">{link.label} (not a web address)</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-slate-500">
                No links yet. <button type="button" className="font-medium text-blue-600" onClick={() => setEditing(true)}>Add the live site, staging, repo or Facebook page</button>.
              </p>
            )}
          </section>

          <section className="card p-5">
            <h2 className="card-title">Brief & notes</h2>
            <Field label="" htmlFor="project-notes" hint="Saved when you click away. Do not paste passwords here.">
              <textarea
                id="project-notes"
                key={`${project.id}:${project.notes}`}
                className="input mt-2 min-h-32"
                defaultValue={project.notes}
                maxLength={10000}
                placeholder="What the project is, what the client wants, ideas…"
                onBlur={(e) => saveNotes(e.target.value)}
              />
            </Field>
          </section>
        </aside>
      </div>

      <Modal open={editing} onClose={() => setEditing(false)} title="Edit project" size="lg">
        {editing && <ProjectForm project={project} onClose={() => setEditing(false)} onSaved={() => mutate()} onArchive={archived ? undefined : archiveIt} />}
      </Modal>
    </>
  );
}
