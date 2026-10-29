"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Download, ExternalLink, FileText, ImageOff, Loader2, Minus, Paperclip, Plus, Trash2 } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { fileSizeText, NOTE_FILE_MAX_BYTES, NOTE_FILES_PER_NOTE } from "@/lib/note-files";
import type { NoteFile } from "@/lib/types";
import { Field } from "@/components/ui/controls";
import { Modal } from "@/components/ui/modal";
import { PDF_ZOOMS, PdfPages } from "./pdf-pages";

type Addresses = { url: string; download_url: string };
const addressesPath = (file: Pick<NoteFile, "id" | "note_id">) => `/notes/${file.note_id}/files/${file.id}`;

/** A picture kept with a note. Its address (from the notes list) works for a day; when it stops working a new one is asked for, once. */
export function FileThumb({ file, className = "" }: { file: NoteFile; className?: string }) {
  const [url, setUrl] = useState(file.url);
  const [failed, setFailed] = useState(false);
  const asked = useRef(false);

  // The address in the list stopped working (or the list had none): ask for a new one, once.
  const renew = () => {
    if (asked.current) return setFailed(true);
    asked.current = true;
    api<Addresses>(addressesPath(file))
      .then((found) => setUrl(found.url))
      .catch(() => setFailed(true));
  };
  const { id, note_id, url: listed } = file;
  useEffect(() => {
    if (listed) return;
    let dead = false;
    api<Addresses>(addressesPath({ id, note_id }))
      .then((found) => !dead && setUrl(found.url))
      .catch(() => !dead && setFailed(true));
    return () => {
      dead = true;
    };
  }, [id, note_id, listed]);

  if (failed || !url) {
    return (
      <span className={`grid place-content-center bg-slate-100 text-slate-400 ${className}`} role="img" aria-label={`${file.name} could not be loaded`}>
        <ImageOff className="size-5" aria-hidden />
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- a signed Storage address, not a site image
  return <img src={url} alt={file.name} loading="lazy" onError={renew} className={className} />;
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

/** A picture or a PDF, large. A picture is shown as it is; a PDF is drawn page by page, so it opens inside the app on every phone. */
export function FileViewer({ file, onClose }: { file: NoteFile | null; onClose: () => void }) {
  return (
    <Modal open={file !== null} onClose={onClose} title={file?.name ?? "File"} description={file ? `${file.kind === "pdf" ? "PDF" : "Picture"} · ${fileSizeText(file.size_bytes)}` : undefined} size={file?.kind === "pdf" ? "xl" : "lg"}>
      {file && <ViewerBody key={file.id} file={file} onClose={onClose} />}
    </Modal>
  );
}

function ViewerBody({ file, onClose }: { file: NoteFile; onClose: () => void }) {
  const [addresses, setAddresses] = useState<Addresses | null>(null);
  const [problem, setProblem] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [pages, setPages] = useState(0);
  const [zoomAt, setZoomAt] = useState(0);
  const pdf = file.kind === "pdf";

  // A fresh address every time a file is opened (an address only works for a few minutes).
  useEffect(() => {
    let dead = false;
    api<Addresses>(addressesPath(file))
      .then((found) => !dead && setAddresses(found))
      .catch((error) => !dead && setProblem(errorMessage(error)));
    return () => {
      dead = true;
    };
  }, [file, attempt]);

  // A PDF is read once; the same bytes are drawn and offered to open in a new tab.
  useEffect(() => {
    if (!pdf || !addresses) return;
    let dead = false;
    fetch(addresses.url)
      .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(String(res.status)))))
      .then((buffer) => !dead && setBytes(new Uint8Array(buffer)))
      .catch(() => !dead && setProblem("The PDF could not be loaded. Check your connection and try again."));
    return () => {
      dead = true;
    };
  }, [pdf, addresses]);

  const blobUrl = useMemo(() => (bytes ? URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" })) : null), [bytes]);
  useEffect(
    () => () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    },
    [blobUrl],
  );

  const retry = () => {
    setProblem("");
    setAddresses(null);
    setBytes(null);
    setAttempt((n) => n + 1);
  };
  const zoom = PDF_ZOOMS[zoomAt];

  return (
    <div className="space-y-3">
      {problem ? (
        <div role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-700">
          <p>{problem}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className="btn btn-secondary btn-sm" onClick={retry}>Try again</button>
            {addresses && (
              <a href={addresses.download_url} className="btn btn-secondary btn-sm">
                <Download className="size-4" aria-hidden /> Download
              </a>
            )}
          </div>
        </div>
      ) : !addresses ? (
        <p className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Opening…
        </p>
      ) : pdf ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1" role="group" aria-label="Zoom">
              <button type="button" className="btn btn-secondary btn-sm btn-icon" onClick={() => setZoomAt((n) => Math.max(0, n - 1))} disabled={zoomAt === 0} aria-label="Zoom out">
                <Minus className="size-4" aria-hidden />
              </button>
              <span className="min-w-12 text-center text-sm text-slate-600" aria-live="polite">{Math.round(zoom * 100)}%</span>
              <button type="button" className="btn btn-secondary btn-sm btn-icon" onClick={() => setZoomAt((n) => Math.min(PDF_ZOOMS.length - 1, n + 1))} disabled={zoomAt === PDF_ZOOMS.length - 1} aria-label="Zoom in">
                <Plus className="size-4" aria-hidden />
              </button>
            </div>
            {pages > 0 && <span className="text-sm text-slate-500">{pages === 1 ? "1 page" : `${pages} pages`}</span>}
            <div className="ml-auto flex flex-wrap gap-2">
              <a href={blobUrl ?? addresses.url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
                <ExternalLink className="size-4" aria-hidden /> Open in new tab
              </a>
              <a href={addresses.download_url} className="btn btn-secondary btn-sm">
                <Download className="size-4" aria-hidden /> Download
              </a>
            </div>
          </div>
          {bytes ? (
            <PdfPages bytes={bytes} zoom={zoom} onLoaded={setPages} onFailed={setProblem} />
          ) : (
            <p className="flex items-center justify-center gap-2 rounded-xl bg-slate-100 py-10 text-sm text-slate-500" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Loading the PDF…
            </p>
          )}
        </>
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element -- a signed Storage address, not a site image */}
          <img src={addresses.url} alt={file.name} className="mx-auto max-h-[65vh] w-auto max-w-full rounded-xl bg-slate-50 object-contain ring-1 ring-slate-200" />
          <div className="flex flex-wrap justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <a href={addresses.url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
                <ExternalLink className="size-4" aria-hidden /> Open full size
              </a>
              <a href={addresses.download_url} className="btn btn-secondary btn-sm">
                <Download className="size-4" aria-hidden /> Download
              </a>
            </div>
          </div>
        </>
      )}
      <div className="flex justify-end">
        <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>Close</button>
      </div>
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
