// Job Apply: the picture saved with a job. Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { fitSize } from "../lib/avatar-image.ts";
import { JOB_IMAGE_BYTES, JOB_IMAGE_QUALITIES, JOB_IMAGE_SIDE } from "../lib/job-image.ts";
import { JOB_IMAGE_BUCKET, JOB_IMAGE_MAX_BYTES, imagePath, jobImageUrl, presentJob, removeAllJobImages, removeJobImages } from "../lib/server/job-image.ts";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const FILE = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

/** A stand-in for the database client that only knows Storage. */
function fakeDb(pages: string[][] = []) {
  const removed: string[][] = [];
  const asked: string[] = [];
  const db = {
    storage: {
      from: (bucket: string) => ({
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://files.example/${bucket}/${path}` } }),
        remove: async (paths: string[]) => {
          removed.push(paths);
          return { error: null };
        },
        list: async (folder: string) => {
          asked.push(folder);
          return { data: (pages.shift() ?? []).map((name) => ({ name })), error: null };
        },
      }),
    },
  };
  return { db: db as never, removed, asked };
}

test("a picture is shrunk to 2000 pixels on its longest side, never enlarged", () => {
  assert.deepEqual(fitSize(4000, 3000, JOB_IMAGE_SIDE), { width: 2000, height: 1500 });
  assert.deepEqual(fitSize(1080, 3840, JOB_IMAGE_SIDE), { width: 563, height: 2000 });
  assert.deepEqual(fitSize(800, 600, JOB_IMAGE_SIDE), { width: 800, height: 600 });
  assert.deepEqual(fitSize(1, 5000, 2000), { width: 1, height: 2000 }, "a very thin picture keeps at least one pixel");
});

test("the browser aims under what the server and the bucket accept", () => {
  assert.ok(JOB_IMAGE_BYTES < JOB_IMAGE_MAX_BYTES);
  assert.ok(JOB_IMAGE_MAX_BYTES <= 4.5 * 1024 * 1024, "Vercel refuses bigger bodies");
  assert.deepEqual([...JOB_IMAGE_QUALITIES].sort((a, b) => b - a), JOB_IMAGE_QUALITIES, "best quality first");
});

test("a job's picture is stored in your own folder and shown by its public address", () => {
  const path = imagePath(USER, "jpg", FILE);
  assert.equal(path, `${USER}/${FILE}.jpg`);
  const { db } = fakeDb();
  assert.equal(jobImageUrl(db, USER, path), `https://files.example/${JOB_IMAGE_BUCKET}/${path}`);
  assert.equal(jobImageUrl(db, USER, null), null);
  assert.equal(jobImageUrl(db, OTHER, path), null, "a path in somebody else's folder is never shown");
  assert.equal(jobImageUrl(db, USER, `${USER}/../${OTHER}/x.jpg`), null);
});

test("the app receives the picture's address, not its storage path", () => {
  const { db } = fakeDb();
  const row = { id: "j1", user_id: USER, title: "MTO", image_path: `${USER}/${FILE}.png` } as never;
  const out = presentJob(db, USER, row) as Record<string, unknown>;
  assert.equal(out.image_url, `https://files.example/${JOB_IMAGE_BUCKET}/${USER}/${FILE}.png`);
  assert.ok(!("image_path" in out));
  assert.equal(out.title, "MTO");
  const none = presentJob(db, USER, { id: "j2", user_id: USER, title: "X", image_path: null } as never) as Record<string, unknown>;
  assert.equal(none.image_url, null);
});

test("only your own files are removed, and nothing is asked when there is nothing to remove", async () => {
  const a = fakeDb();
  await removeJobImages(a.db, USER, [null, undefined, `${USER}/${FILE}.jpg`, `${OTHER}/${FILE}.jpg`]);
  assert.deepEqual(a.removed, [[`${USER}/${FILE}.jpg`]]);
  const b = fakeDb();
  await removeJobImages(b.db, USER, [null, `${OTHER}/${FILE}.jpg`]);
  assert.deepEqual(b.removed, []);
});

test("deleting everything removes the whole folder, page after page", async () => {
  const { db, removed, asked } = fakeDb([["a.jpg", "b.png"], ["c.webp"], []]);
  await removeAllJobImages(db, USER);
  assert.deepEqual(removed, [[`${USER}/a.jpg`, `${USER}/b.png`], [`${USER}/c.webp`]]);
  assert.deepEqual(asked, [USER, USER, USER]);
});
