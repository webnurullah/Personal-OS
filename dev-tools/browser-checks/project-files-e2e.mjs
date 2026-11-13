// Browser check for the files of a project (project page): any file can be added (button or drop), a picture or PDF is previewed
// (a PDF drawn page by page by pdf.js), every file can be downloaded, a file can be deleted, limits and refusals, an archived project
// only views and downloads, phone and desktop widths.
// The app must be running on http://localhost:3123.   Run:  node project-files-e2e.mjs   (a stand-in API answers; SHOTS=<folder> saves pictures)
import { launch, newPhone, apiMock, measure, BASE, TODAY, session } from "/home/user/Personal-OS/dev-tools/browser-checks/audit-lib.mjs";

let failures = 0;
const check = (name, ok, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  → " + extra : ""}`);
};
const SHOTS = process.env.SHOTS;

const browser = await launch();

// ---- real files: a PNG and a JPEG, and a 3-page PDF, made by the browser itself
const maker = await (await browser.newContext()).newPage();
await maker.setContent(`<body style="margin:0"><div style="width:400px;height:300px;background:linear-gradient(135deg,#f59e0b,#3b82f6)"></div></body>`);
const PNG = await maker.screenshot({ type: "png", clip: { x: 0, y: 0, width: 400, height: 300 } });
const JPEG = await maker.screenshot({ type: "jpeg", clip: { x: 0, y: 0, width: 400, height: 300 } });
await maker.setContent(`<body style="font:48px sans-serif">${[1, 2, 3].map((n) => `<h1 style="page-break-after:always;color:#111">Brief page ${n}</h1>`).join("")}</body>`);
const PDF = await maker.pdf({ format: "A4" });
await maker.context().close();
const DOCX = Buffer.concat([Buffer.from("PK\u0003\u0004"), Buffer.alloc(3000, 7)]);
check("the test files are what they say", PDF.subarray(0, 5).toString() === "%PDF-" && PNG[1] === 0x50 && JPEG[0] === 0xff);

const LONG = "A-very-long-file-name-without-any-spaces-" + "x".repeat(120) + ".docx";
const P1 = "10000000-0000-4000-8000-000000000001";
const P2 = "10000000-0000-4000-8000-000000000002";
const project = (id, over = {}) => ({
  id, name: "CRM", kind: "website", status: "active", color: "amber", client: "NWC", goal: "Make a CRM", start_date: "2026-10-01", due_date: "2026-12-31", archived_at: null, created_at: "2026-10-01T00:00:00Z", created_on: "2026-10-01", archived_on: null,
  links: [], notes: "", timeframe: { kind: "dated", label: "Due in 74 days", days: 74, tone: "ok" }, tasks_total: 0, tasks_done: 0, tasks_open: 0, percent: 0, ...over,
});
const file = (n, projectId, kind, name, size, extra = {}) => ({ id: `20000000-0000-4000-8000-0000000000${String(n).padStart(2, "0")}`, project_id: projectId, kind, name, size_bytes: size, created_at: "2026-11-05T10:00:00Z", url: kind === "image" ? `${BASE}/mock-files/img-${n}.png` : null, ...extra });

function freshState() {
  return {
    files: {
      [P1]: [file(1, P1, "image", "Logo.png", 120 * 1024), file(2, P1, "pdf", "Brief.pdf", 850 * 1024), file(3, P1, "file", "Contract v2.docx", 45 * 1024), file(4, P1, "file", LONG, 3 * 1024 * 1024), file(5, P1, "file", "Assets.zip", 2048)],
      [P2]: [file(6, P2, "pdf", "Archived brief.pdf", 100 * 1024), file(7, P2, "file", "Archived notes.docx", 2048)],
    },
    calls: [],
    posted: [],
    failUpload: false,
  };
}

async function setup(ctx, state) {
  await apiMock(ctx, {
    [`/projects/${P1}`]: () => ({ today: TODAY, project: project(P1), tasks: [], files: state.files[P1] }),
    [`/projects/${P2}`]: () => ({ today: TODAY, project: project(P2, { name: "Old site", archived_at: "2026-10-20T00:00:00Z", archived_on: "2026-10-20" }), tasks: [], files: state.files[P2] }),
    [`/projects/${P1}/time`]: { now: new Date().toISOString(), closed_seconds: 0, today_closed_seconds: 0, running: null },
    [`/projects/${P2}/time`]: { now: new Date().toISOString(), closed_seconds: 0, today_closed_seconds: 0, running: null },
  });
  // The stored files: pictures and PDFs are drawn by the app; anything with ?download= is saved by the browser.
  await ctx.route("**/mock-files/**", (route) => {
    const url = new URL(route.request().url());
    const name = url.pathname.split("/").pop();
    state.calls.push(`FILE ${name}${url.searchParams.has("download") ? " (download)" : ""}`);
    const download = url.searchParams.get("download");
    const body = name.endsWith(".png") ? PNG : name.endsWith(".pdf") ? PDF : DOCX;
    return route.fulfill({ status: 200, body, headers: { "content-type": name.endsWith(".png") ? "image/png" : name.endsWith(".pdf") ? "application/pdf" : "application/octet-stream", "access-control-allow-origin": "*", ...(download ? { "content-disposition": `attachment; filename="${encodeURIComponent(download)}"` } : {}) } });
  });
  await ctx.route(/\/api\/projects\/[^/]+\/files\/[^/?]+$/, (route) => {
    const req = route.request();
    const [, , , projectId, , fileId] = new URL(req.url()).pathname.split("/");
    const stored = state.files[projectId]?.find((f) => f.id === fileId);
    state.calls.push(`${req.method()} ${fileId.slice(-2)}`);
    if (req.method() === "DELETE") {
      state.files[projectId] = state.files[projectId].filter((f) => f.id !== fileId);
      return route.fulfill({ json: { ok: true } });
    }
    const ext = stored?.kind === "image" ? "png" : stored?.kind === "pdf" ? "pdf" : "bin";
    return route.fulfill({ json: { url: `${BASE}/mock-files/${fileId}.${ext}?token=${state.calls.length}`, download_url: `${BASE}/mock-files/${fileId}.${ext}?download=${encodeURIComponent(stored?.name ?? "file")}` } });
  });
  await ctx.route(/\/api\/projects\/[^/]+\/files\?/, (route) => {
    const req = route.request();
    const projectId = new URL(req.url()).pathname.split("/")[3];
    const name = new URL(req.url()).searchParams.get("name");
    const body = req.postDataBuffer();
    state.posted.push({ projectId, name, type: req.headers()["content-type"], size: body?.length ?? 0, same: { png: body?.equals(PNG), jpeg: body?.equals(JPEG), pdf: body?.equals(PDF) }, head: body?.subarray(0, 5).toString("latin1") ?? "" });
    if (state.failUpload) return route.fulfill({ status: 502, json: { error: { message: "The file could not be saved. Please try again." } } });
    const head = body?.subarray(0, 5).toString("latin1") ?? "";
    const kind = head.startsWith("%PDF-") ? "pdf" : body?.[1] === 0x50 || body?.[0] === 0xff ? "image" : "file";
    const saved = file(40 + state.posted.length, projectId, kind, name, body?.length ?? 0);
    state.files[projectId].push(saved);
    return route.fulfill({ status: 201, json: saved });
  });
}

for (const width of [390, 320, 1280]) {
  const wide = width >= 1000;
  const ctx = wide ? await browser.newContext({ viewport: { width, height: 900 }, acceptDownloads: true }) : await newPhone(browser, width);
  if (wide) await ctx.addCookies([{ name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), url: BASE }]);
  const state = freshState();
  await setup(ctx, state);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/projects/${P1}`);
  const panel = page.locator("section[aria-label='Project files']");
  await panel.getByRole("list", { name: "Files of this project" }).waitFor({ timeout: 30000 });
  const rows = panel.getByRole("list", { name: "Files of this project" }).locator("li");

  // ---- the list
  check(`${width}px: the Files box lists the 5 files with their kind, size and date, and a count`, (await rows.count()) === 5 && (await panel.getByText("PDF · 850 KB · Nov 5").count()) === 1 && (await panel.getByText("DOCX file · 45 KB").count()) === 1 && (await panel.getByText("ZIP file · 2 KB").count()) === 1 && (await panel.getByText("Picture · 120 KB").count()) === 1 && (await panel.locator("h2 .badge").innerText()) === "5");
  await page.waitForFunction(() => [...document.querySelectorAll("section[aria-label='Project files'] img")].every((i) => i.complete && i.naturalWidth > 0));
  check(`${width}px: a picture shows a small preview of itself, other files a symbol`, (await panel.locator("img").count()) === 1);
  check(`${width}px: a long file name is cut inside the box`, await (async () => {
    const row = rows.filter({ hasText: "A-very-long-file-name" });
    const [r, c] = [await row.boundingBox(), await panel.boundingBox()];
    return r.x + r.width <= c.x + c.width + 1;
  })());
  const m0 = await measure(page, width);
  check(`${width}px: no sideways scrolling`, !m0.zoomedOut && m0.mainClipped === 0 && m0.offenders.length === 0, JSON.stringify(m0));
  if (SHOTS && width === 390) await panel.screenshot({ path: `${SHOTS}/project-files-panel-${width}.png` });
  if (SHOTS && width === 1280) await page.screenshot({ path: `${SHOTS}/project-files-page-${width}.png`, fullPage: true });

  // ---- preview: a picture, a PDF; other files have no preview button
  check(`${width}px: only a picture and a PDF have a Preview button; every file has Download`, (await panel.getByRole("button", { name: /^Preview / }).count()) === 4 /* name button + eye, for picture and pdf */ && (await panel.getByRole("button", { name: /^Download / }).count()) === 5 + 3 /* eye-less rows: download button + the name button of 3 other files */, `${await panel.getByRole("button", { name: /^Preview / }).count()} / ${await panel.getByRole("button", { name: /^Download / }).count()}`);
  await panel.getByRole("button", { name: "Preview Logo.png" }).first().click();
  const viewer = page.getByRole("dialog", { name: "Logo.png" });
  await viewer.locator("img").waitFor();
  await page.waitForFunction(() => document.querySelector("dialog[open] img[alt='Logo.png']")?.naturalWidth > 0);
  check(`${width}px: a picture opens large with its kind and size`, (await viewer.getByText("Picture · 120 KB").count()) === 1 && (await viewer.getByRole("link", { name: "Download" }).count()) === 1);
  await viewer.getByRole("button", { name: "Close", exact: true }).last().click();
  await page.waitForFunction(() => document.querySelectorAll("dialog[open]").length === 0);

  await panel.getByRole("button", { name: "Preview Brief.pdf" }).first().click();
  const pdfViewer = page.getByRole("dialog", { name: "Brief.pdf" });
  await pdfViewer.locator("canvas").first().waitFor({ timeout: 30000 });
  await pdfViewer.getByText("3 pages").waitFor({ timeout: 30000 });
  await page.waitForFunction(() => {
    const c = document.querySelector("dialog[open] canvas");
    if (!c || !c.width) return false;
    const data = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    for (let i = 0; i < data.length; i += 4 * 37) if (data[i] < 200) return true;
    return false;
  }, null, { timeout: 30000 });
  check(`${width}px: a PDF is drawn page by page inside the app (3 pages, with text)`, (await pdfViewer.locator("[data-pdf-page]").count()) === 3 && (await pdfViewer.getByRole("button", { name: "Zoom in" }).count()) === 1);
  const m1 = await measure(page, width);
  check(`${width}px: the PDF viewer does not widen the page`, !m1.zoomedOut && m1.mainClipped === 0, JSON.stringify(m1));
  await pdfViewer.getByRole("button", { name: "Close", exact: true }).last().click();
  await page.waitForFunction(() => document.querySelectorAll("dialog[open]").length === 0);

  // ---- another kind of file: its name downloads; the viewer is never opened
  const [saved] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }), rows.filter({ hasText: "Contract v2.docx" }).getByRole("button", { name: "Download Contract v2.docx" }).last().click()]);
  check(`${width}px: Download saves the file under its own name`, saved.suggestedFilename() === "Contract v2.docx", saved.suggestedFilename());
  check(`${width}px: nothing opened in a viewer for a download`, (await page.locator("dialog[open]").count()) === 0);
  const [saved2] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }), panel.getByRole("button", { name: "Download Assets.zip" }).first().click()]);
  check(`${width}px: clicking the name of a file that cannot be previewed downloads it`, saved2.suggestedFilename() === "Assets.zip", saved2.suggestedFilename());

  // ---- add files: a PNG (kept as it is), a PDF, a DOCX, a too big ZIP, an empty file
  state.calls.length = 0;
  const big = Buffer.alloc(5 * 1024 * 1024, 65);
  await page.locator("#project-files-input").setInputFiles([
    { name: "New logo.png", mimeType: "image/png", buffer: PNG },
    { name: "Spec.pdf", mimeType: "application/pdf", buffer: PDF },
    { name: "Plan.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: DOCX },
    { name: "Everything.zip", mimeType: "application/zip", buffer: big },
    { name: "empty.txt", mimeType: "text/plain", buffer: Buffer.alloc(0) },
  ]);
  await rows.filter({ hasText: "Plan.docx" }).waitFor({ timeout: 20000 });
  await page.getByText("3 files added").first().waitFor();
  const alert = await panel.getByRole("alert").innerText();
  check(`${width}px: the 3 good files are added and the too big and the empty one are refused with their names`, state.posted.length === 3 && alert.includes("“Everything.zip”") && alert.includes("up to 4 MB") && alert.includes("“empty.txt”") && (await rows.count()) === 8, JSON.stringify({ posted: state.posted.length, alert }));
  check(`${width}px: a picture is sent exactly as it is (not turned into a JPEG)`, state.posted.some((p) => p.name === "New logo.png" && p.type === "image/png" && p.same.png), JSON.stringify(state.posted[0]));
  check(`${width}px: the PDF and the other file are sent as they are, with their names`, state.posted.some((p) => p.name === "Spec.pdf" && p.type === "application/pdf" && p.same.pdf) && state.posted.some((p) => p.name === "Plan.docx" && p.size === DOCX.length));
  check(`${width}px: the new files show in the list with the right kind`, (await rows.filter({ hasText: "Spec.pdf" }).innerText()).includes("PDF") && (await rows.filter({ hasText: "New logo.png" }).innerText()).includes("Picture") && (await rows.filter({ hasText: "Plan.docx" }).innerText()).includes("DOCX file"));

  // ---- drop files on the box
  state.posted.length = 0;
  await panel.evaluate((el, bytes) => {
    const data = new DataTransfer();
    data.items.add(new File([new Uint8Array(bytes)], "Dropped notes.txt", { type: "text/plain" }));
    el.dispatchEvent(new DragEvent("dragover", { dataTransfer: data, bubbles: true, cancelable: true }));
    el.dispatchEvent(new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true }));
  }, [104, 105]);
  await rows.filter({ hasText: "Dropped notes.txt" }).waitFor({ timeout: 15000 });
  check(`${width}px: a file dropped on the box is added`, state.posted.length === 1 && state.posted[0].name === "Dropped notes.txt");

  // ---- delete: asks first, says it is for good, removes the file
  state.calls.length = 0;
  await panel.getByRole("button", { name: "Delete Assets.zip" }).click();
  const ask = page.getByRole("dialog", { name: "Delete this file?" });
  await ask.waitFor();
  check(`${width}px: deleting asks first and says it is deleted for good`, (await ask.getByText("will be deleted for good").count()) === 1);
  await ask.getByRole("button", { name: "Delete file" }).click();
  await page.waitForFunction(() => ![...document.querySelectorAll("section[aria-label='Project files'] li")].some((li) => li.textContent.includes("Assets.zip")));
  check(`${width}px: the file is deleted (DELETE sent) and leaves the list`, state.calls.includes("DELETE 05"), JSON.stringify(state.calls));

  // ---- a failed upload says so and the others still work
  state.failUpload = true;
  await page.locator("#project-files-input").setInputFiles([{ name: "Will fail.docx", mimeType: "application/octet-stream", buffer: DOCX }]);
  await panel.getByRole("alert").getByText("The file could not be saved. Please try again.").waitFor({ timeout: 15000 });
  check(`${width}px: a failed upload shows which file and why`, (await panel.getByRole("alert").innerText()).includes("“Will fail.docx”"));
  state.failUpload = false;

  // ---- 20 files: no room for more
  while (state.files[P1].length < 20) state.files[P1].push(file(60 + state.files[P1].length, P1, "file", `Filler ${state.files[P1].length}.txt`, 100));
  await page.reload();
  await panel.getByRole("button", { name: "Full" }).waitFor({ timeout: 30000 });
  check(`${width}px: a project with 20 files has no room (the button says Full and is off)`, await panel.getByRole("button", { name: "Full" }).isDisabled());

  check(`${width}px: no page errors`, errors.length === 0, errors.join(" | "));
  await ctx.close();
}

// ---- an archived project: view and download only
{
  const ctx = await newPhone(browser, 390);
  const state = freshState();
  await setup(ctx, state);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/projects/${P2}`);
  const panel = page.locator("section[aria-label='Project files']");
  await panel.getByRole("list", { name: "Files of this project" }).waitFor({ timeout: 30000 });
  check("archived project: no Add files button, no drop hint and no Delete buttons", (await panel.getByRole("button", { name: /Add files/ }).count()) === 0 && (await panel.getByRole("button", { name: /^Delete / }).count()) === 0 && (await panel.getByText("Choose files or drop them here").count()) === 0);
  check("archived project: its files can still be previewed and downloaded", (await panel.getByRole("button", { name: "Preview Archived brief.pdf" }).count()) >= 1 && (await panel.getByRole("button", { name: "Download Archived notes.docx" }).count()) >= 1);
  await ctx.close();
}

// ---- a saved copy of the project from before files existed opens without trouble
{
  const ctx = await newPhone(browser, 390);
  const state = freshState();
  await setup(ctx, state);
  await ctx.route(`**/api/projects/${P1}`, (route) => route.fulfill({ json: { today: TODAY, project: project(P1), tasks: [] } }));
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/projects/${P1}`);
  const panel = page.locator("section[aria-label='Project files']");
  await panel.getByText("No files yet").waitFor({ timeout: 30000 });
  check("a project answer without files (an older saved copy) shows an empty Files box, no errors", errors.length === 0);
  await ctx.close();
}

await browser.close();
console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
