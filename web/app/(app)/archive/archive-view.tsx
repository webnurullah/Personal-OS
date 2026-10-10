"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Archive, Award, BookOpen, Building2, BriefcaseBusiness, CalendarDays, ChartColumn, Clock, FileText, Flag, FolderKanban, GraduationCap, Layers, PiggyBank, Receipt, RotateCcw, SquareCheck, Tag, Target, Trash2, Bell, Wallet, type LucideIcon } from "lucide-react";
import { api, errorMessage, refreshAll } from "@/lib/api";
import { foreverMessage, kindName, relatedText } from "@/lib/archive";
import { colorOf } from "@/lib/colors";
import { formatDate } from "@/lib/dates";
import type { ArchiveEntry } from "@/lib/types";
import { useFeedback } from "@/components/ui/feedback";
import { EmptyState, LoadError, PageHeader, PageSkeleton } from "@/components/ui/states";
import { forgetProject, useProjectActions } from "../projects/shared";

const ICONS: Record<string, LucideIcon> = {
  task: SquareCheck, note: FileText, event: CalendarDays, goal: Target, milestone: Flag, habit: ChartColumn,
  course: GraduationCap, unit: Layers, topic: BookOpen, study_block: Clock, transaction: Wallet, bill: Receipt,
  budget_category: PiggyBank, category: Tag, reminder: Bell, job: BriefcaseBusiness, project: FolderKanban, resource: Award, company: Building2,
};

/** "2026-10-20" → "20 Oct 2026"; anything else as it is. */
const niceDetail = (detail: string) => (/^\d{4}-\d{2}-\d{2}$/.test(detail) ? formatDate(detail, "short") : detail);

/** Everything you deleted (and the projects you archived) waits here. Restore it, or delete it for good. */
export function ArchiveView() {
  const { data, error, mutate } = useSWR<{ today: string; items: ArchiveEntry[] }>("/archive");
  const { toast, confirm } = useFeedback();
  const projects = useProjectActions();
  const [show, setShow] = useState("all");
  const [busy, setBusy] = useState<string | null>(null);

  if (error && !data) return <LoadError error={error} retry={() => mutate()} />;
  if (!data) return <PageSkeleton />;

  const items = data.items;
  const kinds = [...new Set(items.map((i) => i.kind))].sort((a, b) => kindName(a).localeCompare(kindName(b)));
  const filter = kinds.includes(show) ? show : "all";
  const visible = filter === "all" ? items : items.filter((i) => i.kind === filter);

  const leave = (entry: ArchiveEntry) => mutate((current) => current && { ...current, items: current.items.filter((i) => !(i.id === entry.id && i.source === entry.source)) }, { revalidate: false });

  const restore = async (entry: ArchiveEntry) => {
    setBusy(entry.id);
    try {
      if (entry.source === "project") {
        if (!(await projects.restore({ id: entry.id, name: entry.title }))) return;
      } else {
        await api(`/archive/${entry.id}/restore`, { method: "POST" });
        toast(`${kindName(entry.kind)} “${entry.title}” is back.`);
      }
      await leave(entry);
      await refreshAll();
    } catch (e) {
      // For example a milestone whose goal is still in the Archive: the message says what to restore first.
      toast(errorMessage(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const deleteForever = async (entry: ArchiveEntry) => {
    setBusy(entry.id);
    try {
      if (entry.source === "project") {
        if (!(await projects.deleteForever({ id: entry.id, name: entry.title, tasks_total: entry.related }))) return;
        forgetProject(entry.id);
      } else {
        const ok = await confirm({ title: "Delete for good?", message: foreverMessage(entry.title, entry.kind, entry.related), action: "Delete for good" });
        if (!ok) return;
        await api(`/archive/${entry.id}`, { method: "DELETE" });
        toast(`${kindName(entry.kind)} deleted for good.`);
      }
      await leave(entry);
      await refreshAll();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader title="Archive" description="Everything you delete waits here. Restore it to bring it back, or delete it from here to remove it for good." />

      {items.length === 0 ? (
        <div className="card mt-6">
          <EmptyState icon={Archive} title="The Archive is empty" text="When you delete a task, note, goal, bill or anything else it moves here first. Nothing is gone for good until you delete it from this page.">
            <Link href="/" className="btn btn-secondary">Go to the dashboard</Link>
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <label htmlFor="archive-show" className="text-sm font-medium text-slate-600">Show</label>
            <select id="archive-show" className="input w-auto min-w-44" value={filter} onChange={(e) => setShow(e.target.value)}>
              <option value="all">Everything ({items.length})</option>
              {kinds.map((k) => (
                <option key={k} value={k}>{kindName(k)} ({items.filter((i) => i.kind === k).length})</option>
              ))}
            </select>
          </div>

          <ul className="mt-4 space-y-3">
            {visible.map((entry) => {
              const color = colorOf(entry.color ?? "slate");
              const more = relatedText(entry.kind, entry.related);
              const KindIcon = ICONS[entry.kind] ?? Archive;
              return (
                <li key={`${entry.source}-${entry.id}`} className="card flex flex-wrap items-center gap-4 p-4 sm:px-5">
                  <span className={`icon-tile size-10 shrink-0 ${color.tile}`}>
                    <KindIcon className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="break-words font-semibold text-slate-900 [overflow-wrap:anywhere]">{entry.title}</p>
                    <p className="truncate text-sm text-slate-500">
                      {kindName(entry.kind)}
                      {entry.detail ? ` · ${niceDetail(entry.detail)}` : ""}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      Deleted {formatDate(entry.deleted_on, "short")}
                      {more ? ` · with ${more}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => restore(entry)} disabled={busy === entry.id}>
                      <RotateCcw className="size-4" />
                      Restore
                    </button>
                    <button type="button" className="btn btn-sm text-rose-600 hover:bg-rose-50" onClick={() => deleteForever(entry)} disabled={busy === entry.id} aria-label={`Delete ${entry.title} for good`}>
                      <Trash2 className="size-4" />
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <p className="mt-6 text-xs text-slate-400">Restoring puts an item back with everything that was deleted along with it. Deleting from here cannot be undone.</p>
    </>
  );
}
