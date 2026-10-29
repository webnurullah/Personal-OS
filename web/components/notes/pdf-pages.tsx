"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { Loader2 } from "lucide-react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";

/** How much wider than the box a page is drawn when zoomed in. */
export const PDF_ZOOMS = [1, 1.5, 2, 3];

type Doc = PDFDocumentProxy;

/** Opens a PDF from its bytes. pdf.js is loaded only now (it is big), and draws on the phone itself, so it works the same on every device. */
async function openPdf(bytes: Uint8Array): Promise<PDFDocumentLoadingTask> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  return pdfjs.getDocument({ data: bytes });
}

/** Why a PDF did not open, in words for the owner. */
function problemText(error: unknown) {
  const name = (error as { name?: string } | null)?.name;
  if (name === "PasswordException") return "This PDF is locked with a password, so it cannot be shown here. Use Download to open it in another app.";
  return "This PDF could not be shown here. Use Download to open it in another app.";
}

/** One page, drawn when it comes near the screen (a long PDF is not drawn all at once). */
function Page({ doc, number, width, ratio, scroller }: { doc: Doc; number: number; width: number; ratio: number; scroller: RefObject<HTMLDivElement | null> }) {
  const holder = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  // Without IntersectionObserver (very old browsers) every page is drawn at once.
  const [near, setNear] = useState(number === 1 || typeof IntersectionObserver === "undefined");
  const [height, setHeight] = useState(Math.round(width * ratio));

  useEffect(() => {
    const el = holder.current;
    if (!el || near) return;
    // Watched from the scrolling box, so "near" means near what the person is looking at.
    const watcher = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setNear(true), { root: scroller.current, rootMargin: "800px 0px" });
    watcher.observe(el);
    return () => watcher.disconnect();
  }, [near, scroller]);

  useEffect(() => {
    if (!near || !canvas.current) return;
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null;
    let dead = false;
    (async () => {
      const page = await doc.getPage(number);
      if (dead || !canvas.current) return;
      const base = page.getViewport({ scale: 1 });
      const scale = width / base.width;
      const density = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale: scale * density });
      const target = canvas.current;
      target.width = Math.floor(viewport.width);
      target.height = Math.floor(viewport.height);
      setHeight(Math.round(width * (base.height / base.width)));
      task = page.render({ canvas: target, viewport });
      await task.promise;
    })().catch((error: unknown) => {
      if ((error as { name?: string } | null)?.name !== "RenderingCancelledException") console.error("PDF page failed", error);
    });
    return () => {
      dead = true;
      task?.cancel();
    };
  }, [doc, number, width, near]);

  return (
    <div ref={holder} className="mx-auto mb-3 bg-white shadow-sm ring-1 ring-slate-200" style={{ width, height }} data-pdf-page={number}>
      {near ? <canvas ref={canvas} className="block size-full" aria-label={`Page ${number}`} /> : null}
    </div>
  );
}

/**
 * The pages of a PDF one under the other, as wide as the box (times `zoom`). `onLoaded` tells how many pages it has;
 * `onFailed` gets a message when it cannot be shown.
 */
export function PdfPages({ bytes, zoom, onLoaded, onFailed }: { bytes: Uint8Array; zoom: number; onLoaded?: (pages: number) => void; onFailed: (message: string) => void }) {
  const scroller = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [ratio, setRatio] = useState(1.414);
  const [boxWidth, setBoxWidth] = useState(0);
  const callbacks = useRef({ onLoaded, onFailed });
  useEffect(() => {
    callbacks.current = { onLoaded, onFailed };
  });

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setBoxWidth(Math.round(el.clientWidth / 10) * 10 || el.clientWidth);
    measure();
    const watcher = new ResizeObserver(measure);
    watcher.observe(el);
    return () => watcher.disconnect();
  }, []);

  useEffect(() => {
    let dead = false;
    let task: PDFDocumentLoadingTask | null = null;
    (async () => {
      task = await openPdf(bytes.slice());
      const loaded = await task.promise;
      const first = await loaded.getPage(1);
      if (dead) return;
      const view = first.getViewport({ scale: 1 });
      setRatio(view.height / view.width);
      setDoc(loaded);
      callbacks.current.onLoaded?.(loaded.numPages);
    })().catch((error: unknown) => {
      if (dead) return;
      console.error("PDF could not be opened", error);
      callbacks.current.onFailed(problemText(error));
    });
    return () => {
      dead = true;
      void task?.destroy();
    };
  }, [bytes]);

  const width = Math.round(boxWidth * zoom);
  return (
    <div ref={scroller} className="max-h-[68vh] overflow-auto rounded-xl bg-slate-100 p-2" data-pdf-scroll>
      <div ref={box} className="w-full">
        {doc && width > 0 ? (
          Array.from({ length: doc.numPages }, (_, i) => <Page key={`${i}-${width}`} doc={doc} number={i + 1} width={width} ratio={ratio} scroller={scroller} />)
        ) : (
          <p className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Opening the PDF…
          </p>
        )}
      </div>
    </div>
  );
}
