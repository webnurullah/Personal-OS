// Projects: files kept with a project (any file; pictures and PDFs are previewed). Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { fileEnding, fileKindLabel, PROJECT_FILE_MAX_BYTES, PROJECT_FILES_PER_PROJECT } from "../lib/project-files.ts";
import { PictureError, prepareProjectFile } from "../lib/project-upload.ts";
import { TABLE_PREFIXES } from "../lib/live-sync.ts";
import { classifyProjectFile, cleanProjectFileName, filesOfProject, openProjectFile, presentProjectFiles, projectFilePath, projectFilePaths, PROJECT_FILE_BUCKET, removeAllProjectFiles, removeProjectFiles } from "../lib/server/project-files.ts";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const bytes = (...values: number[]) => new Uint8Array(values);
const text = (value: string) => new TextEncoder().encode(value);

test("what a file is comes from its first bytes: a picture, a PDF, or any other file (its ending from its name)", () => {
  assert.deepEqual(classifyProjectFile(bytes(0xff, 0xd8, 0xff, 0xe0), "x.bin"), { kind: "image", type: "image/jpeg", ext: "jpg" }, "the content wins over the name");
  assert.deepEqual(classifyProjectFile(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), "logo.PNG"), { kind: "image", type: "image/png", ext: "png" });
  assert.deepEqual(classifyProjectFile(text("%PDF-1.7 ..."), "brief.txt"), { kind: "pdf", type: "application/pdf", ext: "pdf" });
  assert.deepEqual(classifyProjectFile(text("PK\u0003\u0004zip"), "Design Files.ZIP"), { kind: "file", type: "application/octet-stream", ext: "zip" });
  assert.deepEqual(classifyProjectFile(text("hello"), "LICENSE"), { kind: "file", type: "application/octet-stream", ext: "" });
  assert.deepEqual(classifyProjectFile(text("<svg></svg>"), "icon.svg"), { kind: "file", type: "application/octet-stream", ext: "svg" }, "an SVG is a file to download, never shown");
  assert.deepEqual(classifyProjectFile(text("<html></html>"), "page.html"), { kind: "file", type: "application/octet-stream", ext: "html" }, "so is a web page");
  assert.equal(classifyProjectFile(text("x"), "a.tar.abcdefghijklm").ext, "", "an ending that is too long is dropped");
  assert.equal(classifyProjectFile(text("x"), "a.p df").ext, "", "an ending with a space is dropped");
  assert.equal(classifyProjectFile(text("x"), undefined).ext, "");
});

test("the stored path lives in the person's own folder, with the ending when there is one", () => {
  assert.equal(projectFilePath(USER, "docx", ID), `${USER}/${ID}.docx`);
  assert.equal(projectFilePath(USER, "", ID), `${USER}/${ID}`);
  assert.equal(PROJECT_FILE_BUCKET, "project-files");
  assert.match(projectFilePath(USER, "docx", ID), /^[0-9a-f-]{36}\/[0-9a-f-]{36}(\.[a-z0-9]{1,10})?$/, "what the database accepts");
});

test("the remembered name: no folders, no control characters, at most 200 characters, a name always", () => {
  assert.equal(cleanProjectFileName("Brief v2.docx"), "Brief v2.docx");
  assert.equal(cleanProjectFileName("../../etc/passwd"), "etc passwd");
  assert.equal(cleanProjectFileName("a\\b/c\u0000d\n e.pdf"), "a b c d e.pdf");
  assert.equal(cleanProjectFileName(""), "File");
  assert.equal(cleanProjectFileName(undefined), "File");
  assert.equal(cleanProjectFileName("  ...  "), "File");
  assert.equal(cleanProjectFileName(".env"), "env", "a leading dot is dropped");
  assert.equal(cleanProjectFileName("বাংলা নথি.docx"), "বাংলা নথি.docx");
  assert.equal(Array.from(cleanProjectFileName("বা".repeat(300))).length, 200, "counted in letters, not bytes");
});

test("labels and endings for the list", () => {
  assert.equal(fileEnding("Brief.docx"), "DOCX");
  assert.equal(fileEnding("archive.tar.gz"), "GZ");
  assert.equal(fileEnding("LICENSE"), "");
  assert.equal(fileKindLabel("pdf", "x.pdf"), "PDF");
  assert.equal(fileKindLabel("image", "x.png"), "Picture");
  assert.equal(fileKindLabel("file", "Brief.docx"), "DOCX file");
  assert.equal(fileKindLabel("file", "LICENSE"), "File");
  assert.equal(PROJECT_FILES_PER_PROJECT, 20);
  assert.equal(PROJECT_FILE_MAX_BYTES, 4 * 1024 * 1024);
});

test("what the browser sends: a small picture as it is, a PDF or other file as it is, and a clear refusal for too big or empty files", async () => {
  const png = new File([bytes(0x89, 0x50)], "logo.png", { type: "image/png" });
  const kept = await prepareProjectFile(png);
  assert.equal(kept.blob, png, "the very same file: a logo keeps its see-through background");
  assert.equal(kept.name, "logo.png");

  const pdf = new File([text("%PDF-1.4")], "Brief.pdf", { type: "application/pdf" });
  assert.deepEqual({ same: (await prepareProjectFile(pdf)).blob === pdf, name: (await prepareProjectFile(pdf)).name }, { same: true, name: "Brief.pdf" });

  const docx = new File([text("PK")], "Contract.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  assert.equal((await prepareProjectFile(docx)).blob, docx);

  const untyped = new File([text("data")], "notes", { type: "" });
  assert.equal((await prepareProjectFile(untyped)).blob.type, "application/octet-stream", "a file the browser gave no type is sent as plain data");

  const gif = new File([text("GIF89a")], "anim.gif", { type: "image/gif" });
  assert.equal((await prepareProjectFile(gif)).blob, gif, "a GIF is kept as a file (downloaded, not previewed)");

  await assert.rejects(() => prepareProjectFile(new File([], "empty.pdf", { type: "application/pdf" })), (e: unknown) => e instanceof PictureError && /empty/.test(e.message));
  const big = new File([new Uint8Array(PROJECT_FILE_MAX_BYTES + 1)], "Huge.zip", { type: "application/zip" });
  await assert.rejects(() => prepareProjectFile(big), (e: unknown) => e instanceof PictureError && e.message.includes("“Huge.zip”") && e.message.includes("up to 4 MB"));
  const bigGif = new File([new Uint8Array(PROJECT_FILE_MAX_BYTES + 1)], "Huge.gif", { type: "image/gif" });
  await assert.rejects(() => prepareProjectFile(bigGif), PictureError);
  const named = await prepareProjectFile(new File([text("x")], "a\\b/c.txt", { type: "text/plain" }));
  assert.equal(named.name, "a b c.txt");
});

/** A stand-in for the database client that knows the files table and Storage. */
function fakeDb(options: { rows?: Record<string, unknown>[]; tableError?: { code: string; message: string }; signFails?: boolean } = {}) {
  const signed: { paths: string[]; seconds: number }[] = [];
  const removed: string[][] = [];
  const listed: string[] = [];
  const pages: string[][] = [["a.pdf", "b"], []];
  const rows = options.rows ?? [];
  const db = {
    from: (table: string) => {
      assert.equal(table, "project_files");
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        then: (resolve: (value: unknown) => unknown) => resolve(options.tableError ? { data: null, error: options.tableError } : { data: rows, error: null }),
      };
      return chain;
    },
    storage: {
      from: (bucket: string) => {
        assert.equal(bucket, PROJECT_FILE_BUCKET);
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

const row = (n: number, kind: "image" | "pdf" | "file", over: Record<string, unknown> = {}) => ({
  id: `00000000-0000-4000-8000-00000000000${n}`, project_id: "99999999-0000-4000-8000-000000000001", kind, name: `File ${n}`, size_bytes: 1000 * n, created_at: `2026-11-0${n}T00:00:00Z`,
  path: `${USER}/0000000${n}-bbbb-4ccc-8ddd-eeeeeeeeeeee.${kind === "image" ? "jpg" : kind === "pdf" ? "pdf" : "zip"}`, ...over,
});

test("pictures get a signed address for a day, PDFs and other files none; the storage path is never sent", async () => {
  const { db, signed } = fakeDb();
  const files = await presentProjectFiles(db, USER, [row(1, "image"), row(2, "pdf"), row(3, "file"), row(4, "image")] as never);
  assert.equal(files.length, 4);
  assert.ok(files[0].url?.startsWith("https://files.example/sign/") && files[3].url);
  assert.equal(files[1].url, null);
  assert.equal(files[2].url, null);
  assert.equal(signed.length, 1, "one batch call for all the pictures");
  assert.equal(signed[0].paths.length, 2);
  assert.equal(signed[0].seconds, 24 * 60 * 60);
  for (const file of files) assert.equal("path" in file, false);
});

test("a picture whose address could not be made still lists (without one); a path outside the folder is never signed", async () => {
  assert.equal((await presentProjectFiles(fakeDb({ signFails: true }).db, USER, [row(1, "image")] as never))[0].url, null);
  const other = fakeDb();
  assert.equal((await presentProjectFiles(other.db, USER, [row(1, "image", { path: `${OTHER}/${ID}.jpg` })] as never))[0].url, null);
  assert.equal(other.signed.length, 0);
});

test("a project's files come in order; before the database step is run there are none, other errors are not hidden", async () => {
  const { db } = fakeDb({ rows: [row(1, "image"), row(2, "pdf")] });
  assert.deepEqual((await filesOfProject(db, USER, "p")).map((f) => f.name), ["File 1", "File 2"]);
  for (const code of ["PGRST205", "42P01"]) assert.deepEqual(await filesOfProject(fakeDb({ tableError: { code, message: "missing" } }).db, USER, "p"), [], code);
  await assert.rejects(() => filesOfProject(fakeDb({ tableError: { code: "XX000", message: "boom" } }).db, USER, "p"), /database/i);
});

test("opening a file gives a view address and a download address under the file's own name; short-lived; only the person's own files", async () => {
  const { db, signed } = fakeDb();
  const found = await openProjectFile(db, USER, { path: `${USER}/${ID}.docx`, name: "Contract v2.docx" });
  assert.ok(found?.url.includes(`${USER}/${ID}.docx`));
  assert.ok(found?.download_url.includes("download=Contract v2.docx"));
  assert.ok(signed.every((s) => s.seconds === 600));
  assert.equal(await openProjectFile(db, USER, { path: `${OTHER}/${ID}.pdf`, name: "x.pdf" }), null);
  assert.equal(await openProjectFile(fakeDb({ signFails: true }).db, USER, { path: `${USER}/${ID}.pdf`, name: "x.pdf" }), null);
});

test("only the person's own stored files are removed; a project's paths are read before it is deleted", async () => {
  const { db, removed } = fakeDb();
  await removeProjectFiles(db, USER, [`${USER}/${ID}.pdf`, `${OTHER}/${ID}.pdf`, null, undefined, `${USER}/../${OTHER}/x.pdf`]);
  assert.deepEqual(removed, [[`${USER}/${ID}.pdf`]]);
  const none = fakeDb();
  await removeProjectFiles(none.db, USER, [null]);
  assert.equal(none.removed.length, 0);
  assert.deepEqual(await projectFilePaths(fakeDb({ rows: [{ path: "p1" }, { path: "p2" }] }).db, "p"), ["p1", "p2"]);
  assert.deepEqual(await projectFilePaths(fakeDb({ tableError: { code: "PGRST205", message: "missing" } }).db, "p"), []);
});

test("delete-all removes every stored project file of the person, page by page", async () => {
  const { db, removed, listed } = fakeDb();
  await removeAllProjectFiles(db, USER);
  assert.deepEqual(listed, [USER, USER]);
  assert.deepEqual(removed, [[`${USER}/a.pdf`, `${USER}/b`]]);
});

test("a change to the project files table reloads the projects on every device", () => {
  assert.deepEqual(TABLE_PREFIXES.project_files, ["/projects"]);
});
