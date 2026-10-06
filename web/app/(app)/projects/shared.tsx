"use client";

import { Folder, Globe, Palette, Share2, type LucideProps } from "lucide-react";
import { api, errorMessage, refresh } from "@/lib/api";
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

/** Deleting a project asks first, and says how many tasks go with it. Returns true when it was deleted. */
export function useRemoveProject() {
  const { toast, confirm } = useFeedback();
  return async (project: { id: string; name: string; tasks_total: number }) => {
    const withTasks = project.tasks_total ? ` and its ${plural(project.tasks_total, "task")}` : "";
    const ok = await confirm({
      title: "Delete this project?",
      message: `“${project.name}”${withTasks} will be deleted for good. If you only want to finish it, use Mark done instead.`,
      action: "Delete project",
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
}

/** Reload everything a project change can affect. */
export const refreshProjects = () => refresh("/projects", "/tasks", "/events");
