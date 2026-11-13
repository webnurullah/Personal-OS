"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, ExternalLink, FileText, ImageOff, Loader2, Minus, Plus } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { fileSizeText } from "@/lib/note-files";
import { fileKindLabel } from "@/lib/project-files";
import { Modal } from "@/components/ui/modal";
import { PDF_ZOOMS, PdfPages } from "./pdf-pages";

/** What the viewer needs to know about a file kept with a note or a project. */
export type ViewableFile = { id: string; name: string; kind: "image" | "pdf" | "file"; size_bytes: number; url: string | null };
type Addresses = { url: string; download_url: string };

/** A picture kept with a note or a project. Its address (from the list) works for a day; when it stops working a new one is asked for, once. `pathFor` is the API path that gives a file's addresses. */
export function FileThumb<F extends ViewableFile>({ file, pathFor, className = "" }: { file: F; pathFor: (file: F) => string; className?: string }) {
  const [url, setUrl] = useState(file.url);
  const [failed, setFailed] = useState(false);
  const asked = useRef(false);

  // The address in the list stopped working (or the list had none): ask for a new one, once.
  const renew = () => {
    if (asked.current) return setFailed(true);
    asked.current = true;
    api<Addresses>(pathFor(file))
      .then((found) => setUrl(found.url))
      .catch(() => setFailed(true));
  };
  const listed = file.url;
  const path = pathFor(file);
  useEffect(() => {
    if (listed) return;
    let dead = false;
    api<Addresses>(path)
      .then((found) => !dead && setUrl(found.url))
      .catch(() => !dead && setFailed(true));
    return () => {
      dead = true;
    };
  }, [path, listed]);

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

/** A picture or a PDF, large. A picture is shown as it is; a PDF is drawn page by page, so it opens inside the app on every phone. Any other file can only be downloaded. */
export function FileViewer<F extends ViewableFile>({ file, onClose, pathFor }: { file: F | null; onClose: () => void; pathFor: (file: F) => string }) {
  return (
    <Modal open={file !== null} onClose={onClose} title={file?.name ?? "File"} description={file ? `${fileKindLabel(file.kind, file.name)} · ${fileSizeText(file.size_bytes)}` : undefined} size={file?.kind === "pdf" ? "xl" : "lg"}>
      {file && <ViewerBody key={file.id} file={file} onClose={onClose} pathFor={pathFor} />}
    </Modal>
  );
}

function ViewerBody<F extends ViewableFile>({ file, onClose, pathFor }: { file: F; onClose: () => void; pathFor: (file: F) => string }) {
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
    api<Addresses>(pathFor(file))
      .then((found) => !dead && setAddresses(found))
      .catch((error) => !dead && setProblem(errorMessage(error)));
    return () => {
      dead = true;
    };
  }, [file, attempt, pathFor]);

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
      ) : file.kind === "file" ? (
        <div className="rounded-xl bg-slate-50 p-5 text-center ring-1 ring-slate-200">
          <FileText className="mx-auto size-10 text-slate-400" aria-hidden />
          <p className="mt-3 text-sm text-slate-600">This kind of file cannot be previewed here. Download it to open it on your device.</p>
          <a href={addresses.download_url} className="btn btn-primary btn-sm mt-4">
            <Download className="size-4" aria-hidden /> Download
          </a>
        </div>
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

