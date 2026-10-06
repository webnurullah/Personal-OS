"use client";

import { Folder, Globe, Palette, Share2, type LucideProps } from "lucide-react";
import { api, errorMessage, refresh } from "@/lib/api";
import { cacheMutate } from "@/lib/cache";
import { plural } from "@/lib/format";
import type { Timeframe } from "@/lib/projects";
import type { ProjectKind } from "@/lib/types";
import { useFeedback } from "@/components/ui/feedback";

/** The icon for a kind of project (imported here, so the shared icon list does not change). */
export function KindIcon({ kind, ...props }: { kind: ProjectKind } & LucideProps) {
  const Icon = kind === "website" ? Globe : kind === "social" ? Share2 : kind === "brand" ? Palette : Folder;
  return <Icon aria-hidden {...props} />;
}

const TONES: Record<Timeframe["tone"], string> = {
  late: "bg-rose-50 text-rose-700",
  soon: "bg-amber-50 text-amber-700",
  ok: "bg-slate-100 text-slate-600",
  none: "bg-slate-100 text-slate-500",
};

/** "Due in 5 days", "Overdue by 2 days", "Ongoing · running 34 days" … */
export function TimeBadge({ timeframe }: { timeframe: Timeframe }) {
  const style = timeframe.kind === "ongoing" ? "bg-sky-50 text-sky-700" : TONES[timeframe.tone];
  return <span className={`badge ${style}`}>{timeframe.label}</span>;
}

type Named = { id: string; name: string };

/**
 * Removing a project is two steps: Archive it (reversible, no questions asked), then delete it for good from the
 * Archive. Each function returns true when it worked.
 */
export function useProjectActions() {
  const { toast, confirm } = useFeedback();

  const setArchived = async (project: Named, archived: boolean) => {
    try {
      await api(`/projects/${project.id}`, { method: "PATCH", body: { archived } });
      toast(archived ? `“${project.name}” moved to the Archive. You can restore or delete it there.` : `“${project.name}” is back in Projects.`);
      return true;
    } catch (e) {
      toast(errorMessage(e), "error");
      return false;
    }
  };

  /** Only for archived projects; says how many tasks go with it. */
  const deleteForever = async (project: Named & { tasks_total: number }) => {
    const withTasks = project.tasks_total ? ` and its ${plural(project.tasks_total, "task")}` : "";
    const ok = await confirm({
      title: "Delete for good?",
      message: `“${project.name}”${withTasks} will be deleted forever. This cannot be undone.`,
      action: "Delete for good",
    });
    if (!ok) return false;
    try {
      await api(`/projects/${project.id}`, { method: "DELETE" });
      toast("Project deleted");
      return true;
    } catch (e) {
      toast(errorMessage(e), "error");
      return false;
    }
  };

  return { archive: (project: Named) => setArchived(project, true), restore: (project: Named) => setArchived(project, false), deleteForever };
}

/** After a project is deleted for good: forget its saved copy, so Back or another tab cannot show it again. */
export const forgetProject = (id: string) => {
  cacheMutate(`/projects/${id}`, undefined, { revalidate: false }).catch(() => undefined);
};

/** Reload everything a project change can affect. */
export const refreshProjects = () => refresh("/projects", "/tasks", "/events");
