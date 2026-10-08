"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Award, BookOpen, Check, Copy, ExternalLink, Hammer, Link2, ListVideo, Pencil, Play, Plus, RotateCcw, Star, Video, type LucideIcon } from "lucide-react";
import { toArchive } from "@/lib/archive";
import { api, errorMessage, refresh } from "@/lib/api";
import { formatDate, daysBetween } from "@/lib/dates";
import { num } from "@/lib/format";
import { isHttpUrl } from "@/lib/projects";
import { applyChange, certificateExpiry, expiryLabel, hasCertificate, kindLabel, progressOf, resumeLine, statusLabel, stepWord, type ResourceChange } from "@/lib/library";
import type { LearningResource, Project, ResourceKind } from "@/lib/types";
import { Progress } from "@/components/ui/charts";
import { useFeedback } from "@/components/ui/feedback";

export type Resources = { today: string; items: LearningResource[] };

/** Everything in the library (one saved list, shared by the library page, the course page and the dashboard). */
export const useResources = () => useSWR<Resources>("/resources");

const KIND_STYLE: Record<ResourceKind, { icon: LucideIcon; tile: string }> = {
  certificate: { icon: Award, tile: "bg-amber-50 text-amber-600" },
  playlist: { icon: ListVideo, tile: "bg-rose-50 text-rose-600" },
  video: { icon: Video, tile: "bg-rose-50 text-rose-500" },
  reading: { icon: BookOpen, tile: "bg-emerald-50 text-emerald-600" },
  other: { icon: Link2, tile: "bg-slate-100 text-slate-500" },
};

const STATUS_BADGE: Record<string, string> = {
  todo: "bg-slate-100 text-slate-600",
  learning: "bg-blue-50 text-blue-700",
  completed: "bg-emerald-50 text-emerald-700",
  dropped: "bg-slate-100 text-slate-400",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`badge shrink-0 whitespace-nowrap ${STATUS_BADGE[status] ?? STATUS_BADGE.todo}`}>{statusLabel(status)}</span>;
}

/** Stars for a 1-5 rating (read only). */
export function Stars({ value }: { value: number | null }) {
  if (!value) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5" role="img" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`size-3.5 ${n <= value ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />
      ))}
    </span>
  );
}

/** The practice projects (your Projects list), by id: the library shows how far each practice has come. */
export function usePracticeProjects() {
  const { data } = useSWR<{ items: Project[] }>("/projects");
  return new Map((data?.items ?? []).map((p) => [p.id, p]));
}

/** "Make a practice project": one project with a few tasks, then opens it (asking again opens the same one). */
export function useMakePractice() {
  const { toast } = useFeedback();
  const router = useRouter();
  return async (item: LearningResource) => {
    try {
      const made = await api<{ project_id: string; created: boolean }>(`/resources/${item.id}/practice`, { method: "POST" });
      await refresh("/resources", "/projects", "/tasks", "/events");
      toast(made.created ? "Practice project made. Do the first task this week." : "Opening your practice project");
      router.push(`/projects/${made.project_id}`);
      return true;
    } catch (e) {
      toast(errorMessage(e), "error");
      return false;
    }
  };
}

/** Copies text and says so. */
export function useCopy() {
  const { toast } = useFeedback();
  return async (text: string, message = "Copied") => {
    try {
      await navigator.clipboard.writeText(text);
      toast(message);
    } catch {
      toast("Could not copy. Select the text and copy it by hand.", "error");
    }
  };
}

/** Changing and deleting items: the change shows at once, then is saved (the server keeps status, counts and dates in step). */
export function useResourceActions() {
  const { data, mutate } = useResources();
  const { toast, confirm } = useFeedback();
  const today = data?.today ?? "";

  const change = async (item: LearningResource, changes: ResourceChange) => {
    const settled = applyChange(item, changes, today);
    await mutate((current) => current && { ...current, items: current.items.map((x) => (x.id === item.id ? { ...x, ...settled } : x)) }, { revalidate: false });
    try {
      await api(`/resources/${item.id}`, { method: "PATCH", body: changes });
      await refresh("/resources");
      return true;
    } catch (e) {
      toast(errorMessage(e), "error");
      await mutate();
      return false;
    }
  };

  const remove = async (item: LearningResource) => {
    if (!(await confirm({ title: "Delete this item?", message: toArchive(`“${item.title}”${hasCertificate(item) ? " and its certificate details" : ""}`) }))) return false;
    try {
      await api(`/resources/${item.id}`, { method: "DELETE" });
      await mutate((current) => current && { ...current, items: current.items.filter((x) => x.id !== item.id) }, { revalidate: false });
      await refresh("/resources", "/archive");
      toast("Moved to the Archive");
      return true;
    } catch (e) {
      toast(errorMessage(e), "error");
      return false;
    }
  };

  return { change, remove };
}

function Chip({ children, tone = "bg-slate-100 text-slate-600" }: { children: ReactNode; tone?: string }) {
  return <span className={`badge max-w-full shrink-0 whitespace-nowrap ${tone}`}>{children}</span>;
}

/** One item in a list: what it is, how far you are, and the next step as a button. */
export function ResourceRow({ item, today, courseName, onEdit, onComplete }: { item: LearningResource; today: string; courseName?: string; onEdit: () => void; onComplete: () => void }) {
  const { change } = useResourceActions();
  const copy = useCopy();
  const practiceProjects = usePracticeProjects();
  const makePractice = useMakePractice();
  const [busy, setBusy] = useState(false);
  const practice = item.practice_project_id ? practiceProjects.get(item.practice_project_id) : undefined;
  const style = KIND_STYLE[item.kind] ?? KIND_STYLE.other;
  const Icon = style.icon;
  const counted = item.items_total > 0;
  const percent = progressOf(item);
  const word = stepWord(item.kind);
  const dueDays = item.due_date ? daysBetween(today, item.due_date) : null;
  const expiry = certificateExpiry(item, today);
  const meta = [kindLabel(item.kind), item.platform, item.provider, item.est_hours ? `${num(Number(item.est_hours))}h` : ""].filter(Boolean).join(" · ");

  const run = async (changes: ResourceChange) => {
    setBusy(true);
    await change(item, changes);
    setBusy(false);
  };

  return (
    <li className={`card p-4 ${item.status === "dropped" ? "opacity-70" : ""}`}>
      <div className="flex items-start gap-3">
        <span className={`icon-tile size-10 shrink-0 ${style.tile}`}>
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="min-w-0 font-semibold leading-snug text-slate-900">
              {isHttpUrl(item.url) ? (
                <a href={item.url} target="_blank" rel="noopener noreferrer" className="hover:text-blue-700">
                  {item.title}
                  <ExternalLink className="ml-1 inline size-3.5 text-slate-400" aria-label="(opens in a new tab)" />
                </a>
              ) : (
                item.title
              )}
            </p>
            <button type="button" className="btn btn-ghost btn-sm btn-icon -mr-2 -mt-1.5 shrink-0" onClick={onEdit} aria-label={`Edit ${item.title}`}>
              <Pencil className="size-4" />
            </button>
          </div>
          {meta && <p className="mt-0.5 text-xs text-slate-500">{meta}</p>}

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <StatusBadge status={item.status} />
            {courseName && <Chip tone="bg-indigo-50 text-indigo-700">{courseName}</Chip>}
            {item.priority === "high" && item.status !== "completed" && <Chip tone="bg-rose-50 text-rose-700">High priority</Chip>}
            {dueDays !== null && (item.status === "todo" || item.status === "learning") && (
              <Chip tone={dueDays < 0 ? "bg-rose-50 text-rose-700" : dueDays <= 3 ? "bg-amber-50 text-amber-700" : undefined}>
                {dueDays < 0 ? `Overdue ${formatDate(item.due_date!, "short")}` : dueDays === 0 ? "Due today" : `Due ${formatDate(item.due_date!, "short")}`}
              </Chip>
            )}
            {item.status === "completed" && hasCertificate(item) && <Chip tone="bg-amber-50 text-amber-700"><Award className="size-3" /> Certificate</Chip>}
            {item.status === "completed" && practice && (
              <Chip tone={practice.percent >= 100 ? "bg-emerald-50 text-emerald-700" : "bg-violet-50 text-violet-700"}>
                <Hammer className="size-3" /> Practised {practice.tasks_done}/{practice.tasks_total}
                {practice.percent >= 100 && (practice.links?.length ?? 0) > 0 ? " · proof" : ""}
              </Chip>
            )}
            {item.status === "completed" && expiry.state !== "none" && expiry.state !== "valid" && (
              <Chip tone={expiry.state === "expired" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}>{expiryLabel(item, today)}</Chip>
            )}
            <Stars value={item.rating} />
          </div>

          {(counted || item.status === "learning") && item.status !== "dropped" && (
            <div className="mt-3">
              {counted && (
                <div className="mb-1 flex items-center justify-between gap-2 text-xs text-slate-500">
                  <span>{item.items_done} of {item.items_total} {word}s</span>
                  <span className="font-semibold text-slate-700">{percent}%</span>
                </div>
              )}
              {counted && <Progress value={percent} fill={item.status === "completed" ? "bg-emerald-500" : "bg-blue-500"} track="bg-slate-100" className="h-2" />}
            </div>
          )}

          {item.status === "completed" && item.takeaway && <p className="mt-2 text-sm text-slate-600">“{item.takeaway}”</p>}
          {item.status === "dropped" && item.dropped_reason && <p className="mt-2 text-sm text-slate-500">Dropped: {item.dropped_reason}</p>}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {item.status === "todo" && (
              <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => run({ status: "learning" })}>
                <Play className="size-3.5" /> Start
              </button>
            )}
            {(item.status === "todo" || item.status === "learning") && counted && item.items_done < item.items_total && (
              <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => run({ items_done: item.items_done + 1 })}>
                <Plus className="size-3.5" /> 1 {word}
              </button>
            )}
            {(item.status === "todo" || item.status === "learning") && (
              <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={onComplete}>
                <Check className="size-3.5" /> Complete
              </button>
            )}
            {item.status === "completed" && practice && (
              <Link href={`/projects/${practice.id}`} className="btn btn-secondary btn-sm">
                <Hammer className="size-3.5" /> Open practice
              </Link>
            )}
            {item.status === "completed" && !practice && (
              <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={async () => { setBusy(true); await makePractice(item); setBusy(false); }}>
                <Hammer className="size-3.5" /> Practise it
              </button>
            )}
            {item.status === "completed" && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => copy(resumeLine(item), "Line copied. Paste it into your CV or LinkedIn.")}>
                <Copy className="size-3.5" /> Copy CV line
              </button>
            )}
            {item.status === "dropped" && (
              <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => run({ status: "todo", dropped_reason: "" })}>
                <RotateCcw className="size-3.5" /> Back to To do
              </button>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}
