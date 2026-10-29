// Notes: pictures and PDFs kept with a note. Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { displayName, fileSizeText, isPdfFile, NOTE_FILE_MAX_BYTES, NOTE_FILES_PER_NOTE } from "../lib/note-files.ts";
import { TABLE_PREFIXES } from "../lib/live-sync.ts";
import { ARCHIVE_KINDS, foreverMessage } from "../lib/archive.ts";
import { archivedFilePaths, cleanName, filePath, filesByNote, NOTE_FILE_BUCKET, openAddresses, presentFiles, removeAllNoteFiles, removeNoteFiles, sniffNoteFile } from "../lib/server/note-files.ts";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const bytes = (...values: number[]) => new Uint8Array(values);
const text = (value: string) => new TextEncoder().encode(value);

test("what a file is comes from its first bytes: pictures and PDFs only", () => {
  assert.deepEqual(sniffNoteFile(bytes(0xff, 0xd8, 0xff, 0xe0)), { kind: "image", type: "image/jpeg", ext: "jpg" });
  assert.deepEqual(sniffNoteFile(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)), { kind: "image", type: "image/png", ext: "png" });
  assert.deepEqual(sniffNoteFile(text("%PDF-1.7\n%âãÏÓ\n1 0 obj")), { kind: "pdf", type: "application/pdf", ext: "pdf" });
  assert.equal(sniffNoteFile(text("\n\n  %PDF-1.4 with a little rubbish in front"))?.kind, "pdf", "readers accept the header within the first 1024 bytes");
  assert.equal(sniffNoteFile(text("x".repeat(1100) + "%PDF-1.4")), null, "but not further in");
  assert.equal(sniffNoteFile(text("<html><script>alert(1)</script></html>")), null);
  assert.equal(sniffNoteFile(text("<svg xmlns='http://www.w3.org/2000/svg'></svg>")), null);
  assert.equal(sniffNoteFile(text("PK\u0003\u0004 a zip or a Word file")), null);
  assert.equal(sniffNoteFile(text("MZ an exe")), null);
  assert.equal(sniffNoteFile(new Uint8Array()), null);
});

test("the stored name: no folders, no control characters, the right ending, at most 200 characters", () => {
  assert.equal(cleanName("Invoice 12.pdf", "pdf"), "Invoice 12.pdf");
  assert.equal(cleanName("Invoice 12", "pdf"), "Invoice 12.pdf");
  assert.equal(cleanName("IMG_0001.HEIC", "jpg"), "IMG_0001.HEIC.jpg", "an ending that is not the picture's own stays part of the name");
  assert.equal(cleanName("Photo.JPEG", "jpg"), "Photo.jpg");
  assert.equal(cleanName("../../etc/passwd", "pdf"), "etc passwd.pdf");
  assert.equal(cleanName("a\\b/c\u0000d\n e.pdf", "pdf"), "a b c d e.pdf");
  assert.equal(cleanName("", "pdf"), "Document.pdf");
  assert.equal(cleanName(undefined, "png"), "Picture.png");
  assert.equal(cleanName("   .pdf  ", "pdf"), "Document.pdf");
  assert.equal(cleanName("বাংলা নথি.pdf", "pdf"), "বাংলা নথি.pdf");
  const long = cleanName("x".repeat(500) + ".pdf", "pdf");
  assert.ok(long.length <= 200 && long.endsWith(".pdf"), String(long.length));
  assert.ok(Array.from(cleanName("বা".repeat(300), "pdf")).length <= 200, "counted in letters, not bytes");
});

test("a staged file gets a short, clean name with the ending of what is sent", () => {
  assert.equal(displayName("IMG_0001.HEIC", "image"), "IMG_0001.jpg");
  assert.equal(displayName("scan.PNG", "image"), "scan.jpg");
  assert.equal(displayName("Résumé final.PDF", "pdf"), "Résumé final.pdf");
  assert.equal(displayName("a/b\\c.pdf", "pdf"), "a b c.pdf");
  assert.equal(displayName("", "image"), "Picture.jpg");
  assert.equal(displayName(".pdf", "pdf"), "Document.pdf");
  assert.ok(displayName("y".repeat(400), "pdf").length <= 200);
});

test("PDFs are recognised by type, or by name when the browser gave no type", () => {
  assert.equal(isPdfFile({ name: "a.pdf", type: "application/pdf" }), true);
  assert.equal(isPdfFile({ name: "a.PDF", type: "" }), true);
  assert.equal(isPdfFile({ name: "a.pdf", type: "image/png" }), false, "a given type wins");
  assert.equal(isPdfFile({ name: "photo.jpg", type: "image/jpeg" }), false);
});

test("file sizes read like a person would say them", () => {
  assert.equal(fileSizeText(0), "0 B");
  assert.equal(fileSizeText(900), "900 B");
  assert.equal(fileSizeText(1024), "1 KB");
  assert.equal(fileSizeText(850 * 1024), "850 KB");
  assert.equal(fileSizeText(2.4 * 1024 * 1024), "2.4 MB");
  assert.equal(fileSizeText(NOTE_FILE_MAX_BYTES), "4 MB");
  assert.equal(fileSizeText(12.6 * 1024 * 1024), "13 MB");
  assert.equal(NOTE_FILES_PER_NOTE, 10);
});

test("a path lives in the person's own folder", () => {
  assert.equal(filePath(USER, "pdf", ID), `${USER}/${ID}.pdf`);
  assert.equal(NOTE_FILE_BUCKET, "note-files");
});

/** A stand-in for the database client that knows the files table and Storage. */
function fakeDb(options: { rows?: Record<string, unknown>[]; tableError?: { code: string; message: string }; signFails?: boolean } = {}) {
  const signed: { paths: string[]; seconds: number }[] = [];
  const removed: string[][] = [];
  const listed: string[] = [];
  const pages: string[][] = [["a.pdf", "b.jpg"], []];
  const rows = options.rows ?? [];
  const db = {
    from: (table: string) => {
      assert.equal(table, "note_files");
      const chain = {
        select: () => chain,
        order: () => chain,
        range: async (from: number, to: number) => (options.tableError ? { data: null, error: options.tableError } : { data: rows.slice(from, to + 1), error: null }),
      };
      return chain;
    },
    storage: {
      from: (bucket: string) => {
        assert.equal(bucket, NOTE_FILE_BUCKET);
        return {
          createSignedUrls: async (paths: string[], seconds: number) => {
            signed.push({ paths, seconds });
            return options.signFails ? { data: null, error: { message: "nope" } } : { data: paths.map((path) => ({ path, signedUrl: `https://files.example/sign/${path}?token=t`, error: null })), error: null };
          },
          createSignedUrl: async (path: string, seconds: number, extra?: { download?: string }) => {
            signed.push({ paths: [path], seconds });
            return options.signFails ? { data: null, error: { message: "nope" } } : { data: { signedUrl: `https://files.example/sign/${path}?token=t${extra?.download ? `&download=${extra.download}` : ""}` }, error: null };
          },
          remove: async (paths: string[]) => {
            removed.push(paths);
            return { error: null };
          },
          list: async (folder: string) => {
            listed.push(folder);
            return { data: (pages.shift() ?? []).map((name) => ({ name })), error: null };
          },
        };
      },
    },
  };
  return { db: db as never, signed, removed, listed };
}

const row = (n: number, kind: "image" | "pdf", over: Record<string, unknown> = {}) => ({
  id: `00000000-0000-4000-8000-00000000000${n}`, note_id: `99999999-0000-4000-8000-00000000000${n % 2}`, kind, name: kind === "pdf" ? `Doc ${n}.pdf` : `Pic ${n}.jpg`, size_bytes: 1000 * n, created_at: `2026-10-0${n}T00:00:00Z`,
  path: `${USER}/${ID.replace(/^a+/, `0000000${n}`.slice(-8))}.${kind === "pdf" ? "pdf" : "jpg"}`, ...over,
});

test("pictures get a signed address for a day, PDFs none (they are opened on demand); the storage path is never sent", async () => {
  const { db, signed } = fakeDb();
  const files = await presentFiles(db, USER, [row(1, "image"), row(2, "pdf"), row(3, "image")] as never);
  assert.equal(files.length, 3);
  assert.ok(files[0].url?.startsWith("https://files.example/sign/") && files[2].url);
  assert.equal(files[1].url, null);
  assert.deepEqual(signed.length, 1, "one batch call for all the pictures");
  assert.equal(signed[0].paths.length, 2);
  assert.equal(signed[0].seconds, 24 * 60 * 60);
  for (const file of files) assert.equal("path" in file, false);
});

test("a picture whose address could not be made still lists (without one); a path outside the folder is never signed", async () => {
  const { db } = fakeDb({ signFails: true });
  const files = await presentFiles(db, USER, [row(1, "image")] as never);
  assert.equal(files[0].url, null);
  const other = fakeDb();
  const foreign = await presentFiles(other.db, USER, [row(1, "image", { path: `${OTHER}/${ID}.jpg` })] as never);
  assert.equal(foreign[0].url, null);
  assert.equal(other.signed.length, 0);
});

test("the notes list gets its files grouped by note, in order", async () => {
  const { db } = fakeDb({ rows: [row(1, "image"), row(2, "pdf"), row(3, "image"), row(4, "pdf")] });
  const grouped = await filesByNote(db, USER);
  assert.equal(grouped.size, 2);
  const odd = grouped.get("99999999-0000-4000-8000-000000000001")!;
  assert.deepEqual(odd.map((f) => f.name), ["Pic 1.jpg", "Pic 3.jpg"]);
});

test("more than 1,000 files are all read", async () => {
  const many = Array.from({ length: 1203 }, (_, i) => ({ ...row(1, "pdf"), id: `f${i}` }));
  const { db } = fakeDb({ rows: many });
  const grouped = await filesByNote(db, USER);
  assert.equal([...grouped.values()].flat().length, 1203);
});

test("before the database step is run the notes still load, just without files; other errors are not hidden", async () => {
  for (const code of ["PGRST205", "42P01"]) {
    const { db } = fakeDb({ tableError: { code, message: "missing" } });
    assert.equal((await filesByNote(db, USER)).size, 0, code);
  }
  const { db } = fakeDb({ tableError: { code: "XX000", message: "boom" } });
  await assert.rejects(() => filesByNote(db, USER), /database/i);
});

test("opening a file gives a view address and a download address under the file's own name; short-lived", async () => {
  const { db, signed } = fakeDb();
  const found = await openAddresses(db, USER, { path: `${USER}/${ID}.pdf`, name: "Invoice 12.pdf" });
  assert.ok(found?.url.includes(`${USER}/${ID}.pdf`));
  assert.ok(found?.download_url.includes("download=Invoice 12.pdf"));
  assert.ok(signed.every((s) => s.seconds === 600));
  assert.equal(await openAddresses(db, USER, { path: `${OTHER}/${ID}.pdf`, name: "x.pdf" }), null, "not another person's file");
  assert.equal(await openAddresses(fakeDb({ signFails: true }).db, USER, { path: `${USER}/${ID}.pdf`, name: "x.pdf" }), null);
});

test("only the person's own stored files are removed", async () => {
  const { db, removed } = fakeDb();
  await removeNoteFiles(db, USER, [`${USER}/${ID}.pdf`, `${OTHER}/${ID}.pdf`, null, undefined, `${USER}/../${OTHER}/x.pdf`]);
  assert.deepEqual(removed, [[`${USER}/${ID}.pdf`]]);
  const none = fakeDb();
  await removeNoteFiles(none.db, USER, [null]);
  assert.equal(none.removed.length, 0);
});

test("delete-all removes every stored file of the person, page by page", async () => {
  const { db, removed, listed } = fakeDb();
  await removeAllNoteFiles(db, USER);
  assert.deepEqual(listed, [USER, USER]);
  assert.deepEqual(removed, [[`${USER}/a.pdf`, `${USER}/b.jpg`]]);
});

test("the files of a note in the Archive are found in its saved copy", () => {
  const saved = { row: { id: "n" }, children: { note_files: [{ path: `${USER}/${ID}.pdf` }, { path: `${USER}/${ID.replace("a", "b")}.jpg` }, { nothing: true }, null] } };
  assert.deepEqual(archivedFilePaths(saved), [`${USER}/${ID}.pdf`, `${USER}/${ID.replace("a", "b")}.jpg`]);
  assert.deepEqual(archivedFilePaths({ row: {}, children: {} }), []);
  assert.deepEqual(archivedFilePaths(null), []);
  assert.deepEqual(archivedFilePaths({ children: { note_files: "x" } }), []);
});

test("the Archive says how many files go with a note", () => {
  assert.deepEqual(ARCHIVE_KINDS.note.related, ["file", "files"]);
  assert.equal(foreverMessage("Trip plan", "note", 2), "“Trip plan” and its 2 files will be deleted forever. This cannot be undone.");
  assert.equal(foreverMessage("Trip plan", "note", 0), "“Trip plan” will be deleted forever. This cannot be undone.");
});

test("a change to the files table reloads the notes on every device", () => {
  assert.deepEqual(TABLE_PREFIXES.note_files, ["/notes"]);
});
