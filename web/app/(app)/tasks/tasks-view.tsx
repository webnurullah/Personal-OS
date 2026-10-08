"use client";

import { toArchive } from "@/lib/archive";
import { useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import useSWR from "swr";
import { CalendarClock, CalendarDays, ChevronDown, CircleAlert, CircleCheck, Flag, Lightbulb, Plus, Search, SearchX, Sun, Trash2 } from "lucide-react";
import { api, errorMessage, refresh } from "@/lib/api";
import { colorOf } from "@/lib/colors";
import { addDays } from "@/lib/dates";
import { pct, plural } from "@/lib/format";
import { useCategories, useProjects } from "@/lib/hooks";
import { useNewAction } from "@/lib/new-action";
import { isOnDay, isOverdue, isUpcoming, taskDateLabel } from "@/lib/tasks";
import type { List, Priority, Task } from "@/lib/types";
import { Donut } from "@/components/ui/charts";
import { Field, Segmented } from "@/components/ui/controls";
import { useFeedback } from "@/components/ui/feedback";
import { Modal, ModalActions } from "@/components/ui/modal";
import { EmptyState, LoadError, PageHeader, PageSkeleton } from "@/components/ui/states";

type Filter = "all" | "today" | "upcoming" | "overdue" | "done";
const PRIORITY: Record<Priority, { label: string; color: string }> = {
  high: { label: "High", color: "text-rose-500" },
  medium: { label: "Medium", color: "text-amber-500" },
  low: { label: "Low", color: "text-slate-400" },
};

export function TasksView() {
  const { data, error, mutate } = useSWR<List<Task>>("/tasks");
  const { categories, byId } = useCategories();
  const { byId: projectsById } = useProjects();
  const { toast, confirm } = useFeedback();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [editing, setEditing] = useState<Task | "new" | null>(null);
  useNewAction(() => setEditing("new"));

  if (error && !data) return <LoadError error={error} retry={() => mutate()} />;
  if (!data) return <PageSkeleton />;

  const today = data.today!;
  const tasks = data.items;
  const open = tasks.filter((t) => !t.done_at);
  const todays = tasks.filter((t) => isOnDay(t, today));
  const doneToday = todays.filter((t) => t.done_at).length;

  const matches = (t: Task) => {
    const q = query.trim().toLowerCase();
    if (q && !`${t.title} ${t.notes}`.toLowerCase().includes(q)) return false;
    if (categoryId && t.category_id !== categoryId) return false;
    switch (filter) {
      case "today": return isOnDay(t, today);
      case "upcoming": return isUpcoming(t, today);
      case "overdue": return isOverdue(t, today);
      case "done": return Boolean(t.done_at);
      default: return true;
    }
  };
  const visible = tasks.filter(matches);
  const groups: { key: string; title: string; tone: string; items: Task[] }[] = [
    { key: "overdue", title: "Overdue", tone: "text-rose-500", items: visible.filter((t) => isOverdue(t, today)) },
    { key: "today", title: "Today", tone: "text-slate-500", items: visible.filter((t) => isOnDay(t, today)) },
    { key: "upcoming", title: "Upcoming", tone: "text-slate-500", items: visible.filter((t) => isUpcoming(t, today)) },
    { key: "someday", title: "No date", tone: "text-slate-500", items: visible.filter((t) => !t.done_at && !t.due_date) },
    { key: "done", title: "Completed", tone: "text-emerald-600", items: visible.filter((t) => t.done_at && !isOnDay(t, today)) },
  ];

  // Instant tick: update the list on screen first, then save.
  const toggle = async (task: Task) => {
    const done_at = task.done_at ? null : new Date().toISOString();
    await mutate({ ...data, items: tasks.map((t) => (t.id === task.id ? { ...t, done_at } : t)) }, { revalidate: false });
    try {
      await api(`/tasks/${task.id}`, { method: "PATCH", body: { done: !task.done_at } });
    } catch (e) {
      toast(errorMessage(e), "error");
    }
    await refresh("/tasks");
  };

  const remove = async (task: Task) => {
    if (!(await confirm({ title: "Delete this task?", message: toArchive(`“${task.title}”`) }))) return;
    // Gone from the list at once; it comes back if the delete fails.
    await mutate((current) => current && { ...current, items: current.items.filter((t) => t.id !== task.id) }, { revalidate: false });
    try {
      await api(`/tasks/${task.id}`, { method: "DELETE" });
      toast("Task moved to the Archive");
    } catch (e) {
      toast(errorMessage(e), "error");
    }
    await refresh("/tasks");
  };

  const openCounts = categories.map((c) => ({ category: c, n: open.filter((t) => t.category_id === c.id).length }));
  const most = Math.max(1, ...openCounts.map((c) => c.n));
  const donePct = pct(doneToday, todays.length);

  return (
    <>
      <PageHeader title="Tasks" description="Plan it, do it, tick it off.">
        <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
          <Plus className="size-4" />
          New Task
        </button>
      </PageHeader>

      <div className="mt-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Summary icon={<Sun className="size-5" />} tile="bg-blue-50 text-blue-600" label="Today" value={`${doneToday} / ${todays.length}`} />
        <Summary icon={<CircleAlert className="size-5" />} tile="bg-rose-50 text-rose-600" label="Overdue" value={open.filter((t) => isOverdue(t, today)).length} />
        <Summary icon={<CalendarClock className="size-5" />} tile="bg-violet-50 text-violet-600" label="Next 7 days" value={open.filter((t) => isUpcoming(t, today) && (t.due_date ?? "") <= addDays(today, 7)).length} />
        <Summary icon={<CircleCheck className="size-5" />} tile="bg-emerald-50 text-emerald-600" label="Done (14 days)" value={tasks.filter((t) => t.done_at).length} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="card p-4 sm:p-5" aria-label="Task list">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Segmented
              label="Show"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: "All" },
                { value: "today", label: "Today" },
                { value: "upcoming", label: "Upcoming" },
                { value: "overdue", label: "Overdue" },
                { value: "done", label: "Completed" },
              ]}
            />
            <div className="flex min-w-0 max-w-full grow gap-2 sm:grow-0">
              <label className="relative min-w-0 flex-1 sm:w-52 sm:flex-none">
                <span className="sr-only">Search tasks</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tasks" className="input h-9 pl-9" />
              </label>
              <select className="select h-9 min-w-0 max-w-[55%] sm:max-w-none" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Category">
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 space-y-5">
            {groups.map((group) => {
              if (!group.items.length) return null;
              const collapsible = group.key === "done" && filter === "all";
              const hidden = collapsible && !showDone;
              return (
                <div key={group.key}>
                  <h3 className={`flex items-center gap-2 px-3 text-xs font-semibold uppercase tracking-wide ${group.tone}`}>
                    {collapsible ? (
                      <button type="button" className="flex items-center gap-2 uppercase" onClick={() => setShowDone((s) => !s)} aria-expanded={!hidden}>
                        {group.title} <span className="rounded-full bg-slate-100 px-1.5 text-[11px] text-slate-500">{group.items.length}</span>
                        <ChevronDown className={`size-3.5 transition ${hidden ? "" : "rotate-180"}`} />
                      </button>
                    ) : (
                      <>
                        {group.title} <span className="rounded-full bg-slate-100 px-1.5 text-[11px] text-slate-500">{group.items.length}</span>
                      </>
                    )}
                  </h3>
                  {!hidden && (
                    <ul className="mt-1.5">
                      {group.items.map((task) => {
                        const category = task.category_id ? byId.get(task.category_id) : undefined;
                        const project = task.project_id ? projectsById.get(task.project_id) : undefined;
                        const overdue = isOverdue(task, today);
                        return (
                          <li key={task.id} className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-slate-50">
                            <label className="-m-2 shrink-0 p-2">
                              <input type="checkbox" className="checkbox" checked={Boolean(task.done_at)} onChange={() => toggle(task)} aria-label={`Done: ${task.title}`} />
                            </label>
                            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditing(task)}>
                              <span className={`block truncate text-sm font-medium ${task.done_at ? "text-slate-400 line-through" : "text-slate-800"}`}>{task.title}</span>
                              <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                                <span className={`flex shrink-0 items-center gap-1 whitespace-nowrap ${overdue ? "text-rose-500" : ""}`}>
                                  <CalendarDays className="size-3.5 shrink-0" />
                                  {taskDateLabel(task, today)}
                                </span>
                                <span className={`flex shrink-0 items-center gap-1 ${PRIORITY[task.priority].color}`}>
                                  <Flag className="size-3.5 shrink-0" />
                                  {PRIORITY[task.priority].label}
                                </span>
                                {project && (
                                  <span className="flex min-w-0 items-center gap-1 sm:hidden">
                                    <span className={`size-2 shrink-0 rounded-full ${colorOf(project.color).dot}`} />
                                    <span className="truncate">{project.name}</span>
                                  </span>
                                )}
                                {category && <span className={`badge max-w-full truncate sm:hidden ${colorOf(category.color).badge}`}>{category.name}</span>}
                              </span>
                            </button>
                            {project && (
                              <Link href={`/projects/${project.id}`} className={`badge hidden max-w-32 truncate sm:inline-flex ${colorOf(project.color).badge}`} title={`Project: ${project.name}`}>
                                {project.name}
                              </Link>
                            )}
                            {category && <span className={`badge hidden max-w-40 truncate sm:inline-flex ${colorOf(category.color).badge}`}>{category.name}</span>}
                            <button type="button" className="btn btn-ghost btn-sm btn-icon reveal" onClick={() => remove(task)} aria-label={`Delete ${task.title}`}>
                              <Trash2 className="size-4" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>

          {!visible.length && (
            <EmptyState icon={SearchX} title={tasks.length ? "No tasks here" : "No tasks yet"} text={tasks.length ? "Try another filter, or add a new task." : "Add your first task and tick it off when it is done."}>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing("new")}>
                <Plus className="size-4" /> New task
              </button>
            </EmptyState>
          )}
        </section>

        <aside className="space-y-5">
          <section className="card p-5">
            <h2 className="card-title">Today&apos;s progress</h2>
            <div className="mt-4 flex items-center gap-5">
              <div className="relative size-28 shrink-0">
                <Donut className="absolute inset-0" segments={[{ value: donePct, color: "#3b82f6" }]} max={100} thickness={12} round />
                <div className="absolute inset-0 grid place-content-center text-center">
                  <p className="text-2xl font-bold text-slate-900">{donePct}%</p>
                  <p className="text-[11px] text-slate-500">done</p>
                </div>
              </div>
              <div className="space-y-1 text-sm">
                <p className="text-slate-600"><b className="text-slate-900">{plural(todays.length - doneToday, "task")}</b> left for today.</p>
                <p className="text-slate-500">Finish the high-priority ones first.</p>
              </div>
            </div>
          </section>

          <section className="card p-5">
            <h2 className="card-title">By category</h2>
            <p className="text-xs text-slate-500">Open tasks in each area</p>
            <ul className="mt-4 space-y-3">
              {openCounts.map(({ category, n }) => (
                <li key={category.id} className="flex items-center gap-3 text-sm">
                  <span className={`size-2.5 shrink-0 rounded-full ${colorOf(category.color).dot}`} />
                  <span className="w-20 truncate text-slate-700">{category.name}</span>
                  <div className="progress h-1.5 flex-1"><span className={colorOf(category.color).bar} style={{ width: `${(n / most) * 100}%` }} /></div>
                  <span className="min-w-5 shrink-0 whitespace-nowrap text-right font-semibold text-slate-800">{n}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="rounded-2xl bg-linear-to-br from-blue-600 to-indigo-600 p-5 text-white shadow-lg shadow-blue-600/20">
            <Lightbulb className="size-6 text-amber-300" />
            <p className="mt-3 font-semibold">Eat the frog</p>
            <p className="mt-1 text-sm text-blue-100">Do your hardest task first thing in the morning. Everything after it feels easy.</p>
          </section>
        </aside>
      </div>

      <TaskModal task={editing} today={today} onClose={() => setEditing(null)} />
    </>
  );
}

function Summary({ icon, tile, label, value }: { icon: ReactNode; tile: string; label: string; value: ReactNode }) {
  return (
    <div className="card flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
      <span className={`icon-tile size-11 shrink-0 ${tile}`}>{icon}</span>
      <div className="min-w-0">
        <p className="text-sm text-slate-500 [overflow-wrap:normal]">{label}</p>
        <p className="text-xl font-bold text-slate-900">{value}</p>
      </div>
    </div>
  );
}

/**
 * Due date, plus an optional end date for tasks that take several days.
 * Once there is an end date, the first date is the start.
 */
function TaskDates({ due, end }: { due: string; end: string }) {
  const [dueDate, setDueDate] = useState(due);
  const [endDate, setEndDate] = useState(end);

  const changeDue = (value: string) => {
    setDueDate(value);
    if (!value) setEndDate(""); // no end date without a due date
    else if (endDate && endDate < value) setEndDate(value);
  };

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label={endDate ? "Start date" : "Due date"} htmlFor="task-due">
        <input id="task-due" name="due_date" type="date" className="input" value={dueDate} onChange={(e) => changeDue(e.target.value)} />
      </Field>
      <Field label="End date (optional)" htmlFor="task-end" hint={dueDate ? "For tasks that take several days." : "Pick a due date first."}>
        <input
          id="task-end"
          name="end_date"
          type="date"
          className="input"
          value={endDate}
          min={dueDate || undefined}
          disabled={!dueDate}
          onChange={(e) => setEndDate(e.target.value)}
        />
      </Field>
    </div>
  );
}

/** New task, or edit an existing one. */
function TaskModal({ task, today, onClose }: { task: Task | "new" | null; today: string; onClose: () => void }) {
  const { categories } = useCategories();
  const { projects, byId: projectsById } = useProjects();
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);
  const editing = task && task !== "new" ? task : null;
  // Done projects are not offered for new work, but a task keeps showing the project it is already in.
  const projectChoices = projects.filter((p) => (p.status !== "done" && !p.archived_at) || p.id === editing?.project_id);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const body = {
      title: String(form.get("title")),
      category_id: String(form.get("category_id")) || null,
      due_date: String(form.get("due_date")) || null,
      end_date: (form.get("end_date") as string | null) || null,
      priority: String(form.get("priority")),
      notes: String(form.get("notes")),
    };
    // The project is only sent when it changed ("" = no project). While the project list is still loading, a task's
    // own project is not in it yet: then leave the project alone instead of unlinking the task by mistake.
    const project = String(form.get("project_id") ?? "") || null;
    const known = !editing?.project_id || projectsById.has(editing.project_id);
    const projectChange = known && project !== (editing?.project_id ?? null) ? { project_id: project } : {};
    setBusy(true);
    try {
      await api(editing ? `/tasks/${editing.id}` : "/tasks", { method: editing ? "PATCH" : "POST", body: { ...body, ...projectChange } });
      await refresh("/tasks");
      toast(editing ? "Task saved" : "Task added");
      onClose();
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  };

  const priorities: Priority[] = ["low", "medium", "high"];
  const chip: Record<Priority, string> = {
    low: "peer-checked:border-slate-400 peer-checked:bg-slate-50 peer-checked:text-slate-900",
    medium: "peer-checked:border-amber-300 peer-checked:bg-amber-50 peer-checked:text-amber-800",
    high: "peer-checked:border-rose-300 peer-checked:bg-rose-50 peer-checked:text-rose-700",
  };

  return (
    <Modal open={task !== null} onClose={onClose} title={editing ? "Edit task" : "New task"} description={editing ? undefined : "Add something to your list."}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Title" htmlFor="task-title">
          <input id="task-title" name="title" className="input" required maxLength={200} defaultValue={editing?.title} placeholder="e.g. Call the plumber" autoComplete="off" autoFocus />
        </Field>
        <Field label="Category" htmlFor="task-category">
          {/* key: start again once the categories have loaded, so the default ("Personal") is picked */}
          <select key={categories.length} id="task-category" name="category_id" className="select select-lg" defaultValue={editing ? editing.category_id ?? "" : categories.find((c) => c.name === "Personal")?.id ?? ""}>
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
        {(projectChoices.length > 0 || editing?.project_id) && (
          <Field label="Project" htmlFor="task-project">
            <select key={projects.length} id="task-project" name="project_id" className="select select-lg" defaultValue={editing?.project_id ?? ""}>
              <option value="">No project</option>
              {projectChoices.map((p) => (
                <option key={p.id} value={p.id}>{p.archived_at ? `${p.name} (archived)` : p.name}</option>
              ))}
            </select>
          </Field>
        )}
        <TaskDates key={editing?.id ?? "new"} due={editing ? editing.due_date ?? "" : today} end={editing?.end_date ?? ""} />
        <fieldset>
          <legend className="label">Priority</legend>
          <div className="grid grid-cols-3 gap-2">
            {priorities.map((p) => (
              <label key={p}>
                <input type="radio" name="priority" value={p} defaultChecked={(editing?.priority ?? "medium") === p} className="peer sr-only" />
                <span className={`flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 text-sm font-medium text-slate-600 transition peer-focus-visible:ring-2 peer-focus-visible:ring-blue-300 ${chip[p]}`}>
                  <Flag className={`size-4 ${PRIORITY[p].color}`} />
                  {PRIORITY[p].label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Notes (optional)" htmlFor="task-notes">
          <textarea id="task-notes" name="notes" className="input" rows={3} maxLength={2000} defaultValue={editing?.notes} />
        </Field>
        <ModalActions onCancel={onClose} submitLabel={editing ? "Save task" : "Add task"} busy={busy} />
      </form>
    </Modal>
  );
}
