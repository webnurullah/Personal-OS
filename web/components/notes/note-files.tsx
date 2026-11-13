"use client";

import { useRef, type ReactNode } from "react";
import { FileText, Loader2, Paperclip, Trash2 } from "lucide-react";
import { fileSizeText, NOTE_FILE_MAX_BYTES, NOTE_FILES_PER_NOTE } from "@/lib/note-files";
import type { NoteFile } from "@/lib/types";
import { Field } from "@/components/ui/controls";
import { FileThumb as BaseThumb, FileViewer as BaseViewer } from "@/components/files/file-viewer";

const notePath = (file: NoteFile) => `/notes/${file.note_id}/files/${file.id}`;

/** A picture kept with a note (see components/files/file-viewer.tsx). */
export function FileThumb({ file, className }: { file: NoteFile; className?: string }) {
  return <BaseThumb file={file} pathFor={notePath} className={className} />;
}

/** A picture or a PDF of a note, large. */
export function FileViewer({ file, onClose }: { file: NoteFile | null; onClose: () => void }) {
  return <BaseViewer file={file} onClose={onClose} pathFor={notePath} />;
}

/** What is shown on a note's card: the pictures as small squares, the PDFs as small bars. Opening one never opens the note's editor. */
export function CardFiles({ files, onOpen }: { files: NoteFile[]; onOpen: (file: NoteFile) => void }) {
  if (!files.length) return null;
  const pictures = files.filter((f) => f.kind === "image");
  const pdfs = files.filter((f) => f.kind === "pdf");
  return (
    <div className="mt-3 space-y-2" onClick={(e) => e.stopPropagation()}>
      {pictures.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Pictures">
          {pictures.map((file) => (
            <li key={file.id}>
              <button type="button" onClick={() => onOpen(file)} aria-label={`View picture ${file.name}`} className="block size-16 overflow-hidden rounded-lg ring-1 ring-black/10 transition hover:ring-blue-400 focus-visible:outline-2 focus-visible:outline-blue-500">
                <FileThumb file={file} className="size-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {pdfs.length > 0 && (
        <ul className="space-y-1.5" aria-label="PDF files">
          {pdfs.map((file) => (
            <li key={file.id}>
              <button type="button" onClick={() => onOpen(file)} aria-label={`View PDF ${file.name}`} className="flex w-full min-w-0 items-center gap-2 rounded-lg bg-white/70 px-2.5 py-2 text-left text-xs text-slate-700 ring-1 ring-black/5 transition hover:ring-blue-400 focus-visible:outline-2 focus-visible:outline-blue-500">
                <FileText className="size-4 shrink-0 text-rose-500" aria-hidden />
                <span className="min-w-0 flex-1 truncate font-medium">{file.name}</span>
                <span className="shrink-0 text-slate-500">{fileSizeText(file.size_bytes)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A file chosen in the form and not saved yet. `preview` is the picture (a local address) for a picture. */
export type Staged = { key: string; kind: "image" | "pdf"; blob: Blob; name: string; preview: string | null };

function FileRow({ kind, name, size, thumb, note, onOpen, onRemove, removeLabel }: { kind: "image" | "pdf"; name: string; size: number; thumb: ReactNode; note?: string; onOpen?: () => void; onRemove: () => void; removeLabel: string }) {
  const body = (
    <>
      <span className="grid size-11 shrink-0 place-content-center overflow-hidden rounded-lg bg-slate-100 ring-1 ring-black/5">{thumb}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-slate-800">{name}</span>
        <span className="block truncate text-xs text-slate-500">{kind === "pdf" ? "PDF" : "Picture"} · {fileSizeText(size)}{note ? ` · ${note}` : ""}</span>
      </span>
    </>
  );
  return (
    <li className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-2">
      {onOpen ? (
        <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={onOpen} aria-label={`View ${name}`}>
          {body}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{body}</div>
      )}
      <button type="button" className="btn btn-ghost btn-sm btn-icon shrink-0 text-rose-600 hover:bg-rose-50" onClick={onRemove} aria-label={removeLabel}>
        <Trash2 className="size-4" aria-hidden />
      </button>
    </li>
  );
}

/** The "Files" part of the note form: the files already saved (view, remove), the ones chosen now (added when the note is saved), and the button to choose more. */
export function FilesField({ saved, staged, preparing, error, onChoose, onUnstage, onRemoveSaved, onView }: {
  saved: NoteFile[];
  staged: Staged[];
  preparing: boolean;
  error: string;
  onChoose: (files: File[]) => void;
  onUnstage: (key: string) => void;
  onRemoveSaved: (file: NoteFile) => void;
  onView: (file: NoteFile) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const room = NOTE_FILES_PER_NOTE - saved.length - staged.length;
  return (
    <Field label="Pictures and PDFs (optional)" htmlFor="note-files-input" hint={`Up to ${NOTE_FILES_PER_NOTE} files. A PDF can be up to ${fileSizeText(NOTE_FILE_MAX_BYTES)}; pictures are made smaller automatically.`}>
      <input
        ref={input}
        id="note-files-input"
        type="file"
        multiple
        accept="image/*,application/pdf,.pdf"
        className="sr-only"
        tabIndex={-1}
        disabled={preparing || room <= 0}
        onChange={(e) => {
          const chosen = Array.from(e.target.files ?? []);
          e.target.value = ""; // choosing the same file again must work too
          if (chosen.length) onChoose(chosen);
        }}
      />
      {(saved.length > 0 || staged.length > 0) && (
        <ul className="mb-3 space-y-2" aria-label="Files of this note">
          {saved.map((file) => (
            <FileRow
              key={file.id}
              kind={file.kind}
              name={file.name}
              size={file.size_bytes}
              thumb={file.kind === "image" ? <FileThumb file={file} className="size-full object-cover" /> : <FileText className="size-5 text-rose-500" aria-hidden />}
              onOpen={() => onView(file)}
              onRemove={() => onRemoveSaved(file)}
              removeLabel={`Remove ${file.name}`}
            />
          ))}
          {staged.map((file) => (
            <FileRow
              key={file.key}
              kind={file.kind}
              name={file.name}
              size={file.blob.size}
              note="added on save"
              thumb={
                file.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a chosen file, shown from the browser
                  <img src={file.preview} alt="" className="size-full object-cover" />
                ) : (
                  <FileText className="size-5 text-rose-500" aria-hidden />
                )
              }
              onRemove={() => onUnstage(file.key)}
              removeLabel={`Do not add ${file.name}`}
            />
          ))}
        </ul>
      )}
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => input.current?.click()} disabled={preparing || room <= 0}>
        {preparing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Paperclip className="size-4" aria-hidden />}
        {preparing ? "Preparing…" : room <= 0 ? "No room for more files" : "Add picture or PDF"}
      </button>
      {error && <p role="alert" className="mt-2 text-sm text-rose-600">{error}</p>}
    </Field>
  );
}
