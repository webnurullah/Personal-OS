// Profile photo: file type check, storage paths and the move/zoom maths. Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { avatarPath, ownsAvatar, sniffImage } from "../lib/server/avatar.ts";
import { cropBox, dragCrop, fitCrop, MAX_ZOOM, startCrop, zoomCrop } from "../lib/avatar-image.ts";

const bytes = (...values: number[]) => new Uint8Array([...values, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const USER = "11111111-1111-4111-8111-111111111111";

test("the picture type comes from the first bytes of the file", () => {
  assert.deepEqual(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0)), { type: "image/jpeg", ext: "jpg" });
  assert.deepEqual(sniffImage(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)), { type: "image/png", ext: "png" });
  const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50]);
  assert.deepEqual(sniffImage(webp), { type: "image/webp", ext: "webp" });
});

test("other files are not accepted as pictures, whatever they are called", () => {
  assert.equal(sniffImage(new Uint8Array()), null);
  assert.equal(sniffImage(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>")), null);
  assert.equal(sniffImage(new TextEncoder().encode("GIF89a....")), null); // GIF is not on the list
  assert.equal(sniffImage(new TextEncoder().encode("<html><body>hi</body></html>")), null);
  assert.equal(sniffImage(bytes(0x52, 0x49, 0x46, 0x46)), null); // RIFF but not WebP (a WAV file, say)
  assert.equal(sniffImage(new Uint8Array([0xff, 0xd8])), null); // too short to be a JPEG
});

test("a photo is stored in your own folder under a new name", () => {
  const id = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  const path = avatarPath(USER, "jpg", id);
  assert.equal(path, `${USER}/${id}.jpg`);
  assert.equal(ownsAvatar(USER, path), true);
});

test("you can only point at files in your own folder", () => {
  assert.equal(ownsAvatar(USER, null), false);
  assert.equal(ownsAvatar(USER, undefined), false);
  assert.equal(ownsAvatar(USER, ""), false);
  assert.equal(ownsAvatar(USER, "22222222-2222-4222-8222-222222222222/x.jpg"), false);
  assert.equal(ownsAvatar(USER, `${USER}/../22222222-2222-4222-8222-222222222222/x.jpg`), false);
  assert.equal(ownsAvatar(USER, `${USER}x/y.jpg`), false);
});

test("a new crop is the whole short side, centred", () => {
  const crop = startCrop(1600, 1200);
  assert.deepEqual(cropBox(1600, 1200, crop), { sx: 200, sy: 0, side: 1200 });
  assert.deepEqual(cropBox(1000, 1000, startCrop(1000, 1000)), { sx: 0, sy: 0, side: 1000 });
  assert.deepEqual(cropBox(900, 1600, startCrop(900, 1600)), { sx: 0, sy: 350, side: 900 });
});

test("zooming in makes the square smaller and keeps its middle", () => {
  const zoomed = zoomCrop(1600, 1200, startCrop(1600, 1200), 2);
  assert.deepEqual(cropBox(1600, 1200, zoomed), { sx: 500, sy: 300, side: 600 });
  // Out of range zoom values are pulled back.
  assert.equal(zoomCrop(1600, 1200, startCrop(1600, 1200), 0.2).zoom, 1);
  assert.equal(zoomCrop(1600, 1200, startCrop(1600, 1200), 99).zoom, MAX_ZOOM);
});

test("dragging moves the picture with the finger and stops at the edges", () => {
  // Preview 256 px wide showing 600 picture pixels: 100 px of dragging = 234.4 picture pixels.
  const zoomed = zoomCrop(1600, 1200, startCrop(1600, 1200), 2);
  const right = dragCrop(1600, 1200, zoomed, 100, 0, 256); // finger right: picture moves right, so we see more of its left part
  assert.ok(cropBox(1600, 1200, right).sx < 500);
  assert.equal(Math.round(cropBox(1600, 1200, right).sx), Math.round(500 - 100 * (600 / 256)));
  // Far past the edge: the square stays inside the picture.
  assert.deepEqual(cropBox(1600, 1200, dragCrop(1600, 1200, zoomed, 99999, 99999, 256)), { sx: 0, sy: 0, side: 600 });
  assert.deepEqual(cropBox(1600, 1200, dragCrop(1600, 1200, zoomed, -99999, -99999, 256)), { sx: 1000, sy: 600, side: 600 });
  // A whole short side cannot move across the short direction at all.
  assert.equal(cropBox(1600, 1200, dragCrop(1600, 1200, startCrop(1600, 1200), 0, 80, 256)).sy, 0);
  // A preview with no size does nothing instead of producing NaN.
  const same = dragCrop(1600, 1200, zoomed, 10, 10, 0);
  assert.deepEqual(same, zoomed);
});

test("zooming out after moving keeps the square inside the picture", () => {
  const zoomed = zoomCrop(1600, 1200, startCrop(1600, 1200), 3);
  const corner = dragCrop(1600, 1200, zoomed, -99999, -99999, 256); // bottom right
  const out = zoomCrop(1600, 1200, corner, 1);
  const box = cropBox(1600, 1200, out);
  assert.ok(box.sx >= 0 && box.sx + box.side <= 1600 && box.sy >= 0 && box.sy + box.side <= 1200);
  assert.deepEqual(fitCrop(1600, 1200, { zoom: 2, cx: -50, cy: 5000 }), { zoom: 2, cx: 300, cy: 900 });
});
