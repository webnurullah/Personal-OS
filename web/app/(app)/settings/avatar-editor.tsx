"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent } from "react";
import { Minus, Plus } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { cropToJpeg, drawCrop, dragCrop, loadPicture, PictureError, MAX_ZOOM, startCrop, zoomCrop, type Crop, type Picture } from "@/lib/avatar-image";
import { Modal, ModalActions } from "@/components/ui/modal";

/** The pop-up where you move and zoom a chosen picture inside the round frame before it is saved. */
export function AvatarEditor({ file, onClose, onUse }: { file: File | null; onClose: () => void; onUse: (picture: Blob) => Promise<void> }) {
  return (
    <Modal open={Boolean(file)} onClose={onClose} title="Adjust your photo" description="Drag the picture to move it. Use the slider to zoom." size="sm">
      {file && <EditorBody file={file} onClose={onClose} onUse={onUse} />}
    </Modal>
  );
}

const PREVIEW_PIXELS = 512;
const KEY_STEP = 12;

function EditorBody({ file, onClose, onUse }: { file: File; onClose: () => void; onUse: (picture: Blob) => Promise<void> }) {
  const [picture, setPicture] = useState<Picture | null>(null);
  const [crop, setCrop] = useState<Crop | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadPicture(file)
      .then((loaded) => {
        if (cancelled) return;
        setPicture(loaded);
        setCrop(startCrop(loaded.width, loaded.height));
      })
      .catch((e) => !cancelled && setError(e instanceof PictureError ? e.message : "This picture cannot be opened here. Try a JPG or PNG photo."));
    return () => {
      cancelled = true;
    };
  }, [file]);

  useEffect(() => {
    if (picture && crop && canvas.current) drawCrop(canvas.current, picture, crop, PREVIEW_PIXELS);
  }, [picture, crop]);

  const move = (dx: number, dy: number, previewSize: number) => {
    if (picture) setCrop((c) => c && dragCrop(picture.width, picture.height, c, dx, dy, previewSize));
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const last = drag.current;
    if (!last || last.id !== e.pointerId) return;
    move(e.clientX - last.x, e.clientY - last.y, e.currentTarget.getBoundingClientRect().width);
    last.x = e.clientX;
    last.y = e.clientY;
  };
  const onPointerEnd = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id === e.pointerId) drag.current = null;
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowLeft: [-KEY_STEP, 0], ArrowRight: [KEY_STEP, 0], ArrowUp: [0, -KEY_STEP], ArrowDown: [0, KEY_STEP] }[e.key];
    if (!step) return;
    e.preventDefault();
    // Pressing an arrow moves the picture the way the arrow points (the same as dragging it that way).
    move(step[0], step[1], e.currentTarget.getBoundingClientRect().width);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!picture || !crop || busy) return;
    setBusy(true);
    setError("");
    try {
      await onUse(await cropToJpeg(picture, crop));
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const ready = Boolean(picture && crop);
  return (
    <form onSubmit={submit}>
      {error && (
        <p role="alert" className="mb-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}
      <div
        className="relative mx-auto size-64 max-w-full touch-none select-none overflow-hidden rounded-2xl bg-slate-100 outline-offset-2 focus-visible:outline-2 focus-visible:outline-blue-500"
        style={{ cursor: ready ? "grab" : "default" }}
        tabIndex={ready ? 0 : -1}
        role="group"
        aria-label="Photo position. Drag the picture, or use the arrow keys, to move it."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onKeyDown={onKeyDown}
      >
        <canvas ref={canvas} data-testid="avatar-preview" className="block size-full" />
        {!ready && !error && <div className="absolute inset-0 grid place-items-center text-sm text-slate-500">Opening your picture…</div>}
        {/* The round frame: what is outside the circle is dimmed. */}
        {ready && <div className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_200px_rgba(255,255,255,0.72)] ring-2 ring-white" />}
      </div>

      <div className="mx-auto mt-5 flex max-w-64 items-center gap-3 text-slate-500">
        <Minus className="size-4 shrink-0" aria-hidden />
        <input
          type="range"
          className="h-6 min-w-0 flex-1 accent-blue-600"
          aria-label="Zoom"
          min={1}
          max={MAX_ZOOM}
          step={0.01}
          disabled={!ready}
          value={crop?.zoom ?? 1}
          onChange={(e) => picture && setCrop((c) => c && zoomCrop(picture.width, picture.height, c, Number(e.target.value)))}
        />
        <Plus className="size-4 shrink-0" aria-hidden />
      </div>

      <ModalActions onCancel={onClose} submitLabel="Use this photo" busy={busy} disabled={!ready} />
    </form>
  );
}
