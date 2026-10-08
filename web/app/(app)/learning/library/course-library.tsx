"use client";

import { useState } from "react";
import Link from "next/link";
import { Award, ArrowUpRight, Plus, Sparkles } from "lucide-react";
import { hm } from "@/lib/format";
import { compareUpNext, courseRollup, ofCourse } from "@/lib/library";
import type { Course, LearningResource } from "@/lib/types";
import { Modal } from "@/components/ui/modal";
import { StarterIdeas } from "./add-many";
import { CompleteDialog } from "./complete-dialog";
import { ResourceForm } from "./resource-form";
import { ResourceRow, useResources } from "./shared";

/** On a course page: the certificate courses and playlists you collected for this subject, and how many are completed. */
export function CourseLibrary({ course }: { course: Pick<Course, "id" | "title"> }) {
  const { data } = useResources();
  const [editing, setEditing] = useState<LearningResource | "new" | null>(null);
  const [ideas, setIdeas] = useState(false);
  const [completing, setCompleting] = useState<LearningResource | null>(null);
  const today = data?.today ?? "";
  const mine = ofCourse(data?.items ?? [], course.id);
  const open = mine.filter((r) => r.status === "todo" || r.status === "learning").sort(compareUpNext);
  const completed = mine.filter((r) => r.status === "completed");
  const dropped = mine.filter((r) => r.status === "dropped");
  const rollup = courseRollup(mine);

  const row = (r: LearningResource) => <ResourceRow key={r.id} item={r} today={today} onEdit={() => setEditing(r)} onComplete={() => setCompleting(r)} />;

  return (
    <section className="card mt-5 p-5" aria-labelledby="library-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="library-title" className="flex items-center gap-2 text-lg font-bold text-[#12305a]">
            <Award className="size-5" /> Courses &amp; playlists
          </h2>
          <p className="text-sm text-slate-500">
            {rollup.total ? `${rollup.completed} of ${rollup.total} completed${rollup.hours ? ` · ${hm(rollup.hours)} learned` : ""}` : "Certificate courses and YouTube playlists for this subject."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/learning/library" className="btn btn-ghost btn-sm">
            Whole library <ArrowUpRight className="size-4" />
          </Link>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setIdeas(true)}>
            <Sparkles className="size-4" /> Ideas
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing("new")}>
            <Plus className="size-4" /> Add
          </button>
        </div>
      </div>

      {mine.length ? (
        <div className="mt-4 space-y-3">
          {open.length > 0 && <ul className="space-y-3">{open.map(row)}</ul>}
          {completed.length > 0 && (
            <>
              <h3 className="pt-1 text-sm font-semibold text-slate-500">Completed ({completed.length})</h3>
              <ul className="space-y-3">{completed.map(row)}</ul>
            </>
          )}
          {dropped.length > 0 && (
            <details>
              <summary className="cursor-pointer text-sm font-semibold text-slate-500">Dropped ({dropped.length})</summary>
              <ul className="mt-3 space-y-3">{dropped.map(row)}</ul>
            </details>
          )}
        </div>
      ) : (
        <p className="mt-4 rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">
          Nothing added for this subject yet. Add the courses and playlists you want to complete, or start from ideas.
        </p>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Add to library" : "Edit item"} size="lg">
        {editing !== null && <ResourceForm key={editing === "new" ? "new" : editing.id} item={editing === "new" ? null : editing} courseId={course.id} onClose={() => setEditing(null)} />}
      </Modal>
      <Modal open={ideas} onClose={() => setIdeas(false)} title="Ideas to start with" description="What people usually take for a subject." size="lg">
        {ideas && <StarterIdeas courseId={course.id} courseName={course.title} onClose={() => setIdeas(false)} />}
      </Modal>
      <Modal open={completing !== null} onClose={() => setCompleting(null)} title="Make it count" description="Keep what you earned from finishing this." size="lg">
        {completing && <CompleteDialog item={completing} today={today} onClose={() => setCompleting(null)} />}
      </Modal>
    </section>
  );
}
