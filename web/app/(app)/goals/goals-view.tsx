"use client";

import { toArchive } from "@/lib/archive";
import { useState, type FormEvent, type ReactNode } from "react";
import useSWR from "swr";
import { GraduationCap, Hourglass, PartyPopper, Pencil, Plus, Target, Trash2, TrendingUp, Trophy, X } from "lucide-react";
import { api, errorMessage, refresh } from "@/lib/api";
import { colorOf } from "@/lib/colors";
import { daysBetween, formatDate } from "@/lib/dates";
import { num } from "@/lib/format";
import { useCategories } from "@/lib/hooks";
import { useNewAction } from "@/lib/new-action";
import { useProfile } from "@/lib/profile";
import type { ColorName, CourseSummary, Goal, GoalStatus } from "@/lib/types";
import { Progress } from "@/components/ui/charts";
import { ColorPicker, Field, IconPicker, Segmented } from "@/components/ui/controls";
import { useFeedback } from "@/components/ui/feedback";
import { GOAL_ICONS, Icon } from "@/components/ui/icon";
import { Modal, ModalActions } from "@/components/ui/modal";
import { EmptyState, LoadError, PageHeader, PageSkeleton } from "@/components/ui/states";

type GoalsResponse = { today: string; items: Goal[]; summary: { active: number; on_track: number; behind: number; average: number } };
type Filter = "active" | GoalStatus;

export function GoalsView() {
  const { data, error, mutate } = useSWR<GoalsResponse>("/goals");
  const [filter, setFilter] = useState<Filter>("active");
  const [editing, setEditing] = useState<Goal | "new" | null>(null);
  const [updating, setUpdating] = useState<Goal | null>(null);
  useNewAction(() => setEditing("new"));

  if (error && !data) return <LoadError error={error} retry={() => mutate()} />;
  if (!data) return <PageSkeleton />;

  const visible = data.items.filter((g) => (filter === "active" ? g.status !== "completed" : g.status === filter));

  return (
    <>
      <PageHeader title="Goals" description="Dream big, start small, keep going.">
        <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
          <Plus className="size-4" />
          New Goal
        </button>
      </PageHeader>

      <div className="mt-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Summary icon={<Target className="size-5" />} tile="bg-blue-50 text-blue-600" label="Active goals" value={data.summary.active} />
        <Summary icon={<TrendingUp className="size-5" />} tile="bg-emerald-50 text-emerald-600" label="On track" value={data.summary.on_track} />
        <Summary icon={<Hourglass className="size-5" />} tile="bg-amber-50 text-amber-600" label="Behind" value={data.summary.behind} />
        <Summary icon={<Trophy className="size-5" />} tile="bg-violet-50 text-violet-600" label="Average progress" value={`${data.summary.average}%`} />
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "active", label: "Active" },
            { value: "on-track", label: "On track" },
            { value: "behind", label: "Behind" },
            { value: "completed", label: "Completed" },
          ]}
        />
        <p className="text-sm text-slate-500">Progress is calculated from each goal&apos;s numbers or milestones.</p>
      </div>

      {visible.length ? (
        <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2 2xl:grid-cols-3">
          {visible.map((goal) => (
            <GoalCard key={goal.id} goal={goal} today={data.today} onEdit={() => setEditing(goal)} onUpdate={() => setUpdating(goal)} />
          ))}
        </div>
      ) : (
        <div className="card mt-5">
          <EmptyState icon={Target} title={data.items.length ? "No goals here" : "No goals yet"} text={data.items.length ? "Try another filter." : "Set a clear, measurable goal and track it step by step."}>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing("new")}>
              <Plus className="size-4" /> New goal
            </button>
          </EmptyState>
        </div>
      )}

      <GoalModal goal={editing} onClose={() => setEditing(null)} />
      <UpdateModal goal={updating} onClose={() => setUpdating(null)} />
    </>
  );
}

function Summary({ icon, tile, label, value }: { icon: ReactNode; tile: string; label: string; value: ReactNode }) {
  return (
    <div className="card flex items-center gap-4 p-4">
      <span className={`icon-tile size-11 ${tile}`}>{icon}</span>
      <div>
        <p className="text-sm text-slate-500">{label}</p>
        <p className="text-xl font-bold text-slate-900">{value}</p>
      </div>
    </div>
  );
}

function useValueText() {
  const { money } = useProfile();
  return (value: number, unit: string) => (unit === "৳" ? money(value) : `${num(Number(value))} ${unit}`.trim());
}

function GoalCard({ goal, today, onEdit, onUpdate }: { goal: Goal; today: string; onEdit: () => void; onUpdate: () => void }) {
  const { byId } = useCategories();
  const { toast, confirm } = useFeedback();
  const valueText = useValueText();
  const [milestone, setMilestone] = useState("");
  const color = colorOf(goal.color);
  const category = goal.category_id ? byId.get(goal.category_id) : undefined;

  const run = async (work: () => Promise<unknown>, done?: string) => {
    try {
      await work();
      if (done) toast(done);
    } catch (error) {
      toast(errorMessage(error), "error");
    }
    await refresh("/goals");
  };

  const deadline = (() => {
    if (goal.status === "completed") return goal.completed_on ? `Completed ${formatDate(goal.completed_on, "date")}` : "Completed";
    if (!goal.deadline) return "No deadline";
    const left = daysBetween(today, goal.deadline);
    return left >= 0 ? `Due ${formatDate(goal.deadline, "date")} · ${left} days left` : `Was due ${formatDate(goal.deadline, "date")}`;
  })();

  const addMilestone = (e: FormEvent) => {
    e.preventDefault();
    const title = milestone.trim();
    if (!title) return;
    setMilestone("");
    run(() => api(`/goals/${goal.id}/milestones`, { method: "POST", body: { title } }));
  };

  const remove = async () => {
    if (!(await confirm({ title: "Delete this goal?", message: toArchive(`“${goal.title}” and its milestones`) }))) return;
    run(() => api(`/goals/${goal.id}`, { method: "DELETE" }), "Goal moved to the Archive");
  };

  return (
    <article className="card flex flex-col p-5">
      <div className="flex flex-wrap items-start gap-3">
        <span className={`icon-tile size-11 shrink-0 ${color.tile}`}>
          <Icon name={goal.icon} className="size-5" />
        </span>
        <div className="min-w-0 flex-1 basis-40">
          <h3 className="font-semibold text-slate-900">{goal.title}</h3>
          <p className="text-xs text-slate-500">{category ? `${category.name} · ` : ""}{deadline}</p>
        </div>
        <select
          className="select status-select h-7 text-xs"
          data-status={goal.status}
          value={goal.status}
          aria-label="Status"
          onChange={(e) => run(() => api(`/goals/${goal.id}`, { method: "PATCH", body: { status: e.target.value } }), `Marked as ${e.target.value.replace("-", " ")}`)}
        >
          <option value="on-track">On track</option>
          <option value="behind">Behind</option>
          <option value="completed">Completed</option>
        </select>
      </div>

      <div className="mt-5 flex items-end justify-between gap-3">
        <p className="text-3xl font-bold tracking-tight text-slate-900">{goal.percent}%</p>
        <p className="text-right text-sm text-slate-500">
          {goal.progress_mode === "milestones"
            ? `${goal.milestones.filter((m) => m.done).length} of ${goal.milestones.length} milestones`
            : `${valueText(goal.current_value, goal.unit)} of ${valueText(goal.target_value, goal.unit)}`}
        </p>
      </div>
      <Progress value={goal.percent} fill={color.bar} className="mt-2 h-2.5" />
      {goal.link_kind && goal.progress_mode === "value" && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
          <GraduationCap className="size-3.5 shrink-0" />
          <span className="min-w-0 truncate">
            {goal.link_kind === "certificates"
              ? "Counts the certificates you complete"
              : goal.linked
                ? `Follows the course “${goal.course_title ?? ""}”`
                : "Its course is gone or has no hours: showing the last numbers"}
          </span>
        </p>
      )}

      {goal.milestones.length > 0 && (
        <ul className="mt-5 space-y-2.5 text-sm">
          {goal.milestones.map((m) => (
            <li key={m.id} className="group flex items-center gap-2.5">
              <input
                id={`m-${m.id}`}
                type="checkbox"
                className="checkbox peer"
                style={{ ["--check" as string]: color.hex }}
                checked={m.done}
                disabled={m.at_value !== null}
                title={m.at_value !== null ? "Ticks itself when the goal reaches this value" : undefined}
                onChange={() => run(() => api(`/milestones/${m.id}`, { method: "PATCH", body: { done: !m.done } }))}
              />
              <label htmlFor={`m-${m.id}`} className="min-w-0 flex-1 text-slate-600 peer-checked:text-slate-400 peer-checked:line-through">{m.title}</label>
              <button type="button" className="reveal -m-1.5 shrink-0 p-1.5 text-slate-400 hover:text-rose-500" onClick={() => run(() => api(`/milestones/${m.id}`, { method: "DELETE" }), "Milestone moved to the Archive")} aria-label={`Remove ${m.title}`}>
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {goal.status === "completed" ? (
        <div className="mt-5 flex items-center gap-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
          <PartyPopper className="size-5 shrink-0" />
          <span className="min-w-0">{goal.note || "Done! Well played."}</span>
        </div>
      ) : (
        <form onSubmit={addMilestone} className="mt-4">
          <label className="flex items-center gap-2 rounded-xl border border-dashed border-slate-200 px-3 py-2 text-sm transition focus-within:border-blue-300">
            <Plus className="size-4 shrink-0 text-slate-400" />
            <input value={milestone} onChange={(e) => setMilestone(e.target.value)} maxLength={200} placeholder="Add a milestone…" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-slate-400" />
          </label>
        </form>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 pt-5">
        <p className="min-w-0 truncate text-xs text-slate-500">{goal.status !== "completed" && goal.note}</p>
        <div className="flex shrink-0 gap-1">
          <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={remove} aria-label="Delete goal">
            <Trash2 className="size-4" />
          </button>
          <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={onEdit} aria-label="Edit goal">
            <Pencil className="size-4" />
          </button>
          {goal.progress_mode === "value" && goal.status !== "completed" && !goal.linked && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={onUpdate}>
              Update
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function UpdateModal({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  const { toast } = useFeedback();
  const valueText = useValueText();
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!goal) return;
    const value = Number(new FormData(e.currentTarget).get("value"));
    setBusy(true);
    try {
      await api(`/goals/${goal.id}`, { method: "PATCH", body: { current_value: value } });
      await refresh("/goals");
      toast(value >= goal.target_value ? "Target reached! Mark it as completed when you are ready." : "Progress updated");
      onClose();
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={goal !== null} onClose={onClose} title="Update progress" description={goal?.title} size="sm">
      {goal && (
        <form onSubmit={submit}>
          <Field label="Where are you now?" htmlFor="goal-value">
            <div className="flex items-center gap-2">
              <input id="goal-value" name="value" type="number" min={0} step="any" className="input" defaultValue={goal.current_value} required autoFocus />
              <span className="w-28 shrink-0 text-sm text-slate-500">of {valueText(goal.target_value, goal.unit)}</span>
            </div>
          </Field>
          <ModalActions onCancel={onClose} submitLabel="Save" busy={busy} />
        </form>
      )}
    </Modal>
  );
}

function GoalModal({ goal, onClose }: { goal: Goal | "new" | null; onClose: () => void }) {
  const editing = goal && goal !== "new" ? goal : null;
  return (
    <Modal open={goal !== null} onClose={onClose} title={editing ? "Edit goal" : "New goal"} description="Make it clear and measurable." size="lg">
      <GoalForm editing={editing} onClose={onClose} />
    </Modal>
  );
}

function GoalForm({ editing, onClose }: { editing: Goal | null; onClose: () => void }) {
  const { categories } = useCategories();
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"value" | "milestones">(editing?.progress_mode ?? "value");
  const [link, setLink] = useState<"" | "course" | "certificates">(editing?.link_kind ?? "");
  const [courseId, setCourseId] = useState(editing?.course_id ?? "");
  const { data: courses } = useSWR<{ items: CourseSummary[] }>(mode === "value" && link === "course" ? "/courses" : null);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {
      title: String(form.get("title")),
      category_id: String(form.get("category_id")) || null,
      icon: String(form.get("icon") || "target"),
      color: String(form.get("color") || "blue") as ColorName,
      progress_mode: mode,
      deadline: String(form.get("deadline")) || null,
      note: String(form.get("note")),
    };
    const followed = mode === "value" ? link : "";
    body.link_kind = followed || null;
    body.course_id = followed === "course" ? courseId : null;
    if (followed === "course") {
      const course = courses?.items.find((c) => c.id === courseId);
      if (!course) {
        toast("Pick the course this goal follows.", "error");
        return;
      }
      // The numbers typed by hand are the course's today; they show again only if the course is deleted.
      body.target_value = Math.max(0.01, Number(course.est_hours));
      body.current_value = Number(course.done_hours);
      body.unit = "hours";
    } else if (mode === "value") {
      body.target_value = Number(form.get("target_value"));
      body.current_value = followed === "certificates" ? 0 : Number(form.get("current_value") || 0);
      body.unit = String(form.get("unit")).trim();
    }
    setBusy(true);
    try {
      await api(editing ? `/goals/${editing.id}` : "/goals", { method: editing ? "PATCH" : "POST", body });
      await refresh("/goals");
      toast(editing ? "Goal saved" : "Goal created. Good luck!");
      onClose();
    } catch (error) {
      toast(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Goal" htmlFor="goal-title">
        <input id="goal-title" name="title" className="input" required maxLength={200} defaultValue={editing?.title} placeholder="e.g. Save for a new laptop" autoComplete="off" autoFocus />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category" htmlFor="goal-category">
          <select id="goal-category" name="category_id" className="select select-lg" defaultValue={editing?.category_id ?? ""}>
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Deadline" htmlFor="goal-deadline">
          <input id="goal-deadline" name="deadline" type="date" className="input" defaultValue={editing?.deadline ?? ""} />
        </Field>
      </div>
      <fieldset className="min-w-0">
        <legend className="label">How is progress measured?</legend>
        <Segmented
          label="Progress"
          value={mode}
          onChange={(next) => {
            setMode(next);
            if (next === "milestones") setLink("");
          }}
          options={[
            { value: "value", label: "A number (money, km, books…)" },
            { value: "milestones", label: "Milestones I tick" },
          ]}
        />
      </fieldset>
      {mode === "value" && (
        <Field label="Progress comes from" htmlFor="goal-link" hint={link === "course" ? "The hours you finish in the course move this goal by themselves." : link === "certificates" ? "Each certificate course you complete from now on counts one." : undefined}>
          <select id="goal-link" className="select select-lg" value={link} onChange={(e) => setLink(e.target.value as "" | "course" | "certificates")}>
            <option value="">A number I update myself</option>
            <option value="course">A course (Learning)</option>
            <option value="certificates">Certificates I earn (Learning)</option>
          </select>
        </Field>
      )}
      {mode === "value" && link === "course" && (
        <Field label="Course" htmlFor="goal-course">
          <select id="goal-course" className="select select-lg" value={courseId} onChange={(e) => setCourseId(e.target.value)} required>
            <option value="">{courses ? "Choose a course…" : "Loading…"}</option>
            {courses?.items.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        </Field>
      )}
      {mode === "value" && link !== "course" && (
        <div className={`grid gap-4 ${link === "certificates" ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
          {link === "" && (
            <Field label="Now" htmlFor="goal-current">
              <input id="goal-current" name="current_value" type="number" min={0} step="any" className="input" defaultValue={editing?.current_value ?? 0} />
            </Field>
          )}
          <Field label="Target" htmlFor="goal-target">
            <input id="goal-target" name="target_value" type="number" min={0.01} step="any" className="input" required defaultValue={editing?.target_value} placeholder={link === "certificates" ? "e.g. 2" : "e.g. 120000"} />
          </Field>
          <Field label="Unit" htmlFor="goal-unit">
            <input key={link} id="goal-unit" name="unit" className="input" maxLength={20} defaultValue={link === "certificates" ? "certificates" : (editing?.unit ?? "৳")} list="goal-units" autoComplete="off" />
            <datalist id="goal-units">
              <option value="৳" /><option value="km" /><option value="books" /><option value="hours" /><option value="kg" />
            </datalist>
          </Field>
        </div>
      )}
      {mode === "milestones" && !editing && <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">Add the milestones on the goal card after you create it.</p>}
      <Field label="Icon">
        <IconPicker name="icon" value={editing?.icon ?? "target"} icons={GOAL_ICONS} />
      </Field>
      <Field label="Colour">
        <ColorPicker name="color" value={editing?.color ?? "blue"} />
      </Field>
      <Field label="Note (optional)" htmlFor="goal-note">
        <input id="goal-note" name="note" className="input" maxLength={500} defaultValue={editing?.note} placeholder="Why it matters, or the next step" autoComplete="off" />
      </Field>
      <ModalActions onCancel={onClose} submitLabel={editing ? "Save goal" : "Create goal"} busy={busy} />
    </form>
  );
}
