"use client";

import { useRef } from "react";
import { ExternalLink, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { Field } from "@/components/ui/controls";
import { Modal } from "@/components/ui/modal";

/**
 * The picture of a job in the Add / Edit form: choose a screenshot or photo of the post, see it at once, change or
 * remove it. `shown` is what is on screen now (the new choice, or the saved picture unless it was removed).
 */
export function JobPictureField({ shown, preparing, error, onFile, onRemove }: { shown: string | null; preparing: boolean; error: string; onFile: (file: File) => void; onRemove: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <Field label="Picture (optional)" htmlFor="job-picture" hint="A screenshot or photo of the job post. It is shown on the job after you save.">
      <input
        ref={input}
        id="job-picture"
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ""; // choosing the same file again must work too
          if (file) onFile(file);
        }}
      />
      {shown && (
        // eslint-disable-next-line @next/next/no-img-element -- a chosen file or a Storage address, not a site image
        <img src={shown} alt="The picture of this job" className="mb-3 max-h-60 w-full rounded-xl bg-slate-50 object-contain ring-1 ring-slate-200" />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => input.current?.click()} disabled={preparing}>
          {preparing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ImagePlus className="size-4" aria-hidden />}
          {preparing ? "Preparing…" : shown ? "Change image" : "Upload image"}
        </button>
        {shown && !preparing && (
          <button type="button" className="btn btn-ghost btn-sm text-rose-600 hover:bg-rose-50" onClick={onRemove}>
            <Trash2 className="size-4" aria-hidden />
            Remove image
          </button>
        )}
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-rose-600">{error}</p>}
    </Field>
  );
}

/** The saved picture of a job, large, with a link to open it on its own. */
export function JobPictureViewer({ open, onClose, src, title }: { open: boolean; onClose: () => void; src: string; title: string }) {
  return (
    <Modal open={open} onClose={onClose} title="Picture of the job post" description={title} size="lg">
      {open && (
        <div className="space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- a Storage address, not a site image */}
          <img src={src} alt={`The picture saved with ${title}`} className="mx-auto max-h-[65vh] w-auto max-w-full rounded-xl bg-slate-50 object-contain ring-1 ring-slate-200" />
          <div className="flex flex-wrap justify-between gap-2">
            <a href={src} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
              <ExternalLink className="size-4" aria-hidden />
              Open full size
            </a>
            <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>Close</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
