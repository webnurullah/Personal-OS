"use client";

import { useState, type FormEvent } from "react";
import { Archive, Plus, X } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { fixLink } from "@/lib/job-actions";
import { isHttpUrl, PROJECT_KINDS, PROJECT_STATUSES } from "@/lib/projects";
import type { Project, ProjectKind, ProjectLink, ProjectStatus } from "@/lib/types";
import { ColorPicker, Field } from "@/components/ui/controls";
import { useFeedback } from "@/components/ui/feedback";
import { ModalActions } from "@/components/ui/modal";
import { refreshProjects } from "./shared";

export type FullProject = Project & { links: ProjectLink[]; notes: string };

/** Add or edit a project. The due date is optional: leave it empty for an ongoing project. */
export function ProjectForm({ project, onClose, onSaved, onArchive }: {
  project: FullProject | null;
  onClose: () => void;
  /** Called with the saved project (new or changed). */
  onSaved?: (saved: { id: string }) => void;
  /** Edit mode only: shows an Archive button. */
  onArchive?: () => void;
}) {
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [start, setStart] = useState(project?.start_date ?? "");
  const [due, setDue] = useState(project?.due_date ?? "");
  const [links, setLinks] = useState<ProjectLink[]>(project?.links ?? []);

  const setLink = (index: number, change: Partial<ProjectLink>) => setLinks((list) => list.map((l, i) => (i === index ? { ...l, ...change } : l)));

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const text = (key: string) => String(form.get(key) ?? "").trim();
    if (!text("name")) return setError("Give the project a name.");
    if (start && due && due < start) return setError("The due date cannot be before the start date.");

    // Links: skip empty rows, add https:// when it is missing, and refuse anything that is not a web address.
    const cleaned: ProjectLink[] = [];
    for (const row of links) {
      const url = fixLink(row.url);
      if (!url && !row.label.trim()) continue;
      if (!isHttpUrl(url)) return setError(`“${row.url || row.label}” is not a web address (it should start with https://).`);
      cleaned.push({ label: row.label.trim() || new URL(url).hostname.replace(/^www\./, ""), url });
    }

    setBusy(true);
    setError("");
    const body = {
      name: text("name"),
      kind: text("kind") as ProjectKind,
      color: text("color") || "blue",
      client: text("client"),
      goal: text("goal"),
      start_date: start || null,
      due_date: due || null,
      links: cleaned,
      notes: text("notes"),
      ...(project ? { status: text("status") as ProjectStatus } : {}),
    };
    try {
      const saved = project ? await api<{ id: string }>(`/projects/${project.id}`, { method: "PATCH", body }) : await api<{ id: string }>("/projects", { method: "POST", body });
      await refreshProjects();
      toast(project ? "Project updated" : `Project “${body.name}” added`);
      onSaved?.(saved);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <Field label="Project name" htmlFor="p-name">
        <input id="p-name" name="name" className="input" defaultValue={project?.name ?? ""} maxLength={120} placeholder="e.g. Rahim's bakery website" required autoFocus />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Type" htmlFor="p-kind">
          <select id="p-kind" name="kind" className="input" defaultValue={project?.kind ?? "website"}>
            {PROJECT_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </Field>
        {project ? (
          <Field label="Status" htmlFor="p-status">
            <select id="p-status" name="status" className="input" defaultValue={project.status}>
              {PROJECT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
        ) : (
          <Field label="For whom" htmlFor="p-client" hint="Leave empty for your own project.">
            <input id="p-client" name="client" className="input" maxLength={120} placeholder="Client or page name" />
          </Field>
        )}
        {project && (
          <Field label="For whom" htmlFor="p-client" hint="Leave empty for your own project." className="sm:col-span-2">
            <input id="p-client" name="client" className="input" defaultValue={project.client} maxLength={120} placeholder="Client or page name" />
          </Field>
        )}
      </div>

      <Field label="Colour">
        <ColorPicker name="color" value={project?.color ?? "blue"} />
      </Field>

      <Field label="Goal" htmlFor="p-goal" hint="One line: what does done look like?">
        <input id="p-goal" name="goal" className="input" defaultValue={project?.goal ?? ""} maxLength={300} placeholder="e.g. Launch the site by Eid" />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Start date (optional)" htmlFor="p-start">
          <input id="p-start" type="date" className="input" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="Due date (optional)" htmlFor="p-due" hint="Leave it empty for an ongoing project with no end date.">
          <div className="flex gap-2">
            <input id="p-due" type="date" className="input min-w-0 flex-1" value={due} onChange={(e) => setDue(e.target.value)} />
            {due && (
              <button type="button" className="btn btn-secondary shrink-0" onClick={() => setDue("")}>
                No due date
              </button>
            )}
          </div>
        </Field>
      </div>

      <div>
        <p className="label">Links</p>
        {links.length > 0 && (
          <ul className="space-y-2">
            {links.map((row, i) => (
              <li key={i} className="flex gap-2">
                <input className="input w-1/3 min-w-0" value={row.label} onChange={(e) => setLink(i, { label: e.target.value })} maxLength={60} placeholder="Label (Live site)" aria-label={`Link ${i + 1} label`} />
                <input className="input min-w-0 flex-1" value={row.url} onChange={(e) => setLink(i, { url: e.target.value })} maxLength={500} placeholder="https://…" aria-label={`Link ${i + 1} address`} />
                <button type="button" className="btn btn-ghost btn-icon shrink-0" onClick={() => setLinks((list) => list.filter((_, j) => j !== i))} aria-label={`Remove link ${i + 1}`}>
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {links.length < 12 && (
          <button type="button" className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700" onClick={() => setLinks((list) => [...list, { label: "", url: "" }])}>
            <Plus className="size-4" />
            Add a link (staging, live site, repo, Facebook page…)
          </button>
        )}
      </div>

      <Field label="Brief & notes" htmlFor="p-notes" hint="Do not paste passwords here.">
        <textarea id="p-notes" name="notes" className="input min-h-24" defaultValue={project?.notes ?? ""} maxLength={10000} placeholder="What the project is, what the client wants, ideas…" />
      </Field>

      <ModalActions
        onCancel={onClose}
        submitLabel={project ? "Save changes" : "Add project"}
        busy={busy}
        left={
          onArchive && (
            <button type="button" className="btn btn-secondary" onClick={onArchive}>
              <Archive className="size-4" />
              Archive
            </button>
          )
        }
      />
    </form>
  );
}
