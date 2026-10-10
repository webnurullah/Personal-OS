// Profile photo, on the phone or computer: open the picture you chose, let you move and zoom it inside a
// square, and cut that square out as a small JPEG. The maths is plain functions (tested); the rest uses the browser.

/** The saved picture is this many pixels wide and tall (about 20 KB), plenty for the round photo at any screen density. */
export const AVATAR_SIZE = 256;
/** While choosing, the picture is kept at this size at most, so moving and zooming stay quick. */
const WORKING_SIZE = 1600;
const MAX_SOURCE_BYTES = 30 * 1024 * 1024;
export const MAX_ZOOM = 3;

/** Which part of the picture is used: the zoom (1 = the whole short side) and the middle of the square, in picture pixels. */
export type Crop = { zoom: number; cx: number; cy: number };

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);

/** The whole short side, centred. */
export function startCrop(width: number, height: number): Crop {
  return { zoom: 1, cx: width / 2, cy: height / 2 };
}

/** The square to cut out (top-left corner and side, in picture pixels), always inside the picture. */
export function cropBox(width: number, height: number, crop: Crop) {
  const side = Math.min(width, height) / clamp(crop.zoom, 1, MAX_ZOOM);
  return { sx: clamp(crop.cx - side / 2, 0, width - side), sy: clamp(crop.cy - side / 2, 0, height - side), side };
}

/** The same crop, with the zoom and position pulled back into range. */
export function fitCrop(width: number, height: number, crop: Crop): Crop {
  const { sx, sy, side } = cropBox(width, height, crop);
  return { zoom: clamp(crop.zoom, 1, MAX_ZOOM), cx: sx + side / 2, cy: sy + side / 2 };
}

/** Dragging the preview (which is `previewSize` pixels wide) by dx, dy pixels moves the picture along with the finger. */
export function dragCrop(width: number, height: number, crop: Crop, dx: number, dy: number, previewSize: number): Crop {
  if (!(previewSize > 0)) return crop;
  const scale = cropBox(width, height, crop).side / previewSize;
  return fitCrop(width, height, { ...crop, cx: crop.cx - dx * scale, cy: crop.cy - dy * scale });
}

export function zoomCrop(width: number, height: number, crop: Crop, zoom: number): Crop {
  return fitCrop(width, height, { ...crop, zoom });
}

/** A message that is fine to show as it is. */
export class PictureError extends Error {}

export type Picture = { canvas: HTMLCanvasElement; width: number; height: number };

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; release: () => void }> {
  try {
    // Turns phone photos upright using their saved orientation.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
  } catch {
    // Older browsers: a normal image element (it also applies the saved orientation).
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, release: () => URL.revokeObjectURL(url) };
  }
}

/**
 * The size a picture gets when its longest side may be `max` pixels at most and (when given) it may have `maxPixels` pixels in all.
 * It is never enlarged. The pixel limit keeps a very tall screenshot readable: its width is not squeezed to fit its height.
 */
export function fitSize(width: number, height: number, max: number, maxPixels = Infinity) {
  const scale = Math.min(1, max / Math.max(width, height), Math.sqrt(maxPixels / (width * height)));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Opens the chosen file as a picture (white behind any see-through parts, big pictures shrunk to `maxSize` pixels, and `maxPixels` in all, for speed). */
export async function loadPicture(file: File, maxSize = WORKING_SIZE, maxPixels = Infinity): Promise<Picture> {
  if (file.type && (!file.type.startsWith("image/") || file.type === "image/svg+xml")) throw new PictureError("Please choose a picture (JPG, PNG or WebP).");
  if (file.size > MAX_SOURCE_BYTES) throw new PictureError("That picture is too large (over 30 MB). Choose a smaller one.");
  let decoded;
  try {
    decoded = await decode(file);
  } catch {
    throw new PictureError("This picture cannot be opened here. Try a JPG or PNG photo.");
  }
  try {
    const { source, width, height } = decoded;
    if (!width || !height) throw new PictureError("This picture cannot be opened here. Try a JPG or PNG photo.");
    const size = fitSize(width, height, maxSize, maxPixels);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) throw new PictureError("This browser cannot edit pictures.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingQuality = "high";
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    return { canvas, width: canvas.width, height: canvas.height };
  } finally {
    decoded.release();
  }
}

/** Draws the chosen square of the picture into a canvas (`size` × `size` pixels). */
export function drawCrop(target: HTMLCanvasElement, picture: Picture, crop: Crop, size: number) {
  if (target.width !== size) target.width = size;
  if (target.height !== size) target.height = size;
  const context = target.getContext("2d");
  if (!context) return;
  const { sx, sy, side } = cropBox(picture.width, picture.height, crop);
  context.imageSmoothingQuality = "high";
  context.drawImage(picture.canvas, sx, sy, side, side, 0, 0, size, size);
}

/** The chosen square as the small JPEG that gets uploaded. */
export function cropToJpeg(picture: Picture, crop: Crop): Promise<Blob> {
  const canvas = document.createElement("canvas");
  drawCrop(canvas, picture, crop, AVATAR_SIZE);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new PictureError("This browser could not prepare the picture."))), "image/jpeg", 0.88);
  });
}
