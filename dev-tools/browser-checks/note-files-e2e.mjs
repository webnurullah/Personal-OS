// Browser check for pictures and PDFs in notes: shown on the card, opened in a viewer (a PDF drawn page by page by pdf.js),
// added and removed in the note form, limits, a stale picture address, long names, phone and desktop widths.
// The app must be running on http://localhost:3123.   Run:  node note-files-e2e.mjs   (a stand-in API answers; SHOTS=<folder> saves pictures)
import { launch, newPhone, apiMock, measure, BASE, TODAY, session } from "/home/user/Personal-OS/dev-tools/browser-checks/audit-lib.mjs";

let failures = 0;
const check = (name, ok, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  → " + extra : ""}`);
};
const SHOTS = process.env.SHOTS;

const browser = await launch();

// ---- real files: a JPEG and a 3-page PDF made by the browser itself
const maker = await (await browser.newContext()).newPage();
await maker.setContent(`<body style="margin:0"><div style="width:400px;height:300px;background:linear-gradient(135deg,#f59e0b,#3b82f6)"></div></body>`);
const JPEG = await maker.screenshot({ type: "jpeg", clip: { x: 0, y: 0, width: 400, height: 300 } });
await maker.setContent(`<body style="font:48px sans-serif">${[1, 2, 3].map((n) => `<h1 style="page-break-after:always;color:#111">Test PDF page ${n}</h1>`).join("")}</body>`);
const PDF = await maker.pdf({ format: "A4" });
await maker.context().close();
check("the test PDF is a PDF and the test picture a JPEG", PDF.subarray(0, 5).toString() === "%PDF-" && JPEG[0] === 0xff && JPEG[1] === 0xd8);

const LONG = "A-very-long-file-name-without-any-spaces-" + "x".repeat(120) + ".pdf";
const file = (id, noteId, kind, name, size = 120000) => ({ id, note_id: noteId, kind, name, size_bytes: size, created_at: "2026-10-05T10:00:00Z", url: kind === "image" ? `${BASE}/mock-files/${id}.jpg` : null });
const note = (id, title, over = {}) => ({ id, title, body: "", tag: "", color: "white", pinned: false, created_at: "2026-10-01T10:00:00Z", updated_at: "2026-10-05T10:00:00Z", files: [], ...over });
const N1 = "00000000-0000-4000-8000-000000000001";
const N2 = "00000000-0000-4000-8000-000000000002";
const N3 = "00000000-0000-4000-8000-000000000003";
const N4 = "00000000-0000-4000-8000-000000000004";
const fid = (n) => `10000000-0000-4000-8000-00000000000${n}`;

function freshState() {
  return {
    notes: [
      note(N1, "Trip documents", { body: "Visa and tickets", tag: "Travel", files: [file(fid(1), N1, "image", "Passport photo.jpg", 200000), file(fid(2), N1, "image", "Ticket.jpg", 150000), file(fid(3), N1, "pdf", "Visa application.pdf", 850 * 1024)] }),
      note(N2, "Long names", { files: [file(fid(4), N2, "pdf", LONG, 3 * 1024 * 1024)] }),
      note(N3, "Plain note", { body: "No files here" }),
      note(N4, "Full note", { files: Array.from({ length: 10 }, (_, i) => file(`20000000-0000-4000-8000-0000000000${String(i).padStart(2, "0")}`, N4, "pdf", `Doc ${i + 1}.pdf`)) }),
    ],
    calls: [],
    posted: [],
    expiredOnce: new Set(),
    failUpload: false,
  };
}

async function setup(browserCtx, state) {
  await apiMock(browserCtx, {
    "/notes": (method) => (method === "GET" ? { today: TODAY, items: state.notes } : { id: "00000000-0000-4000-8000-0000000000aa" }),
    "/reminders": { today: TODAY, items: [] },
  });
  // Files: the addresses and the bytes (a picture address can be made to fail once, like an expired one).
  await browserCtx.route("**/mock-files/**", (route) => {
    const url = new URL(route.request().url());
    const id = url.pathname.split("/").pop().replace(/\.(jpg|pdf)$/, "");
    state.calls.push(`FILE ${url.pathname}`);
    if (state.expiredOnce.has(id)) {
      state.expiredOnce.delete(id);
      return route.fulfill({ status: 403, body: "expired" });
    }
    const pdf = url.pathname.endsWith(".pdf");
    return route.fulfill({ status: 200, body: pdf ? PDF : JPEG, headers: { "content-type": pdf ? "application/pdf" : "image/jpeg", "access-control-allow-origin": "*" } });
  });
  await browserCtx.route("**/api/notes/*/files/*", (route) => {
    const req = route.request();
    const [, , , noteId, , fileId] = new URL(req.url()).pathname.split("/");
    state.calls.push(`${req.method()} /notes/${noteId.slice(-1)}/files/${fileId.slice(-2)}`);
    if (req.method() === "DELETE") {
      const owner = state.notes.find((n) => n.id === noteId);
      owner.files = owner.files.filter((f) => f.id !== fileId);
      return route.fulfill({ json: { ok: true } });
    }
    const stored = state.notes.flatMap((n) => n.files).find((f) => f.id === fileId);
    const ext = stored?.kind === "image" ? "jpg" : "pdf";
    return route.fulfill({ json: { url: `${BASE}/mock-files/${fileId}.${ext}?token=${state.calls.length}`, download_url: `${BASE}/mock-files/${fileId}.${ext}?download=${encodeURIComponent(stored?.name ?? "file")}` } });
  });
  await browserCtx.route(/\/api\/notes\/[^/]+\/files\?/, (route) => {
    const req = route.request();
    const noteId = new URL(req.url()).pathname.split("/")[3];
    const name = new URL(req.url()).searchParams.get("name");
    const body = req.postDataBuffer();
    state.posted.push({ noteId, name, type: req.headers()["content-type"], size: body?.length ?? 0, head: body?.subarray(0, 5).toString("latin1") ?? "", jpeg: body?.[0] === 0xff });
    if (state.failUpload) return route.fulfill({ status: 502, json: { error: { message: "The file could not be saved. Please try again." } } });
    const kind = body?.[0] === 0xff ? "image" : "pdf";
    const saved = file(`30000000-0000-4000-8000-0000000000${String(state.posted.length).padStart(2, "0")}`, noteId, kind, name, body?.length ?? 0);
    state.notes.find((n) => n.id === noteId)?.files.push(saved);
    return route.fulfill({ status: 201, json: saved });
  });
  await browserCtx.route(/\/api\/notes(\/[^/]+)?$/, (route) => {
    const req = route.request();
    if (req.method() === "GET") return route.fallback();
    const id = new URL(req.url()).pathname.split("/")[3] ?? "00000000-0000-4000-8000-0000000000aa";
    state.calls.push(`${req.method()} /notes${id.length > 5 ? "/" + id.slice(-1) : ""}`);
    return route.fulfill({ status: req.method() === "POST" ? 201 : 200, json: { id } });
  });
}

const cardOf = (page, title) => page.locator("article", { has: page.getByRole("heading", { name: title }) });

for (const width of [390, 320, 1280]) {
  const wide = width >= 1000;
  const ctx = wide ? await browser.newContext({ viewport: { width, height: 900 } }) : await newPhone(browser, width);
  if (wide) await ctx.addCookies([{ name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), url: BASE }]);
  const state = freshState();
  await setup(ctx, state);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("dialog", (d) => d.dismiss());
  await page.goto(`${BASE}/notes`);
  await page.getByRole("heading", { name: "Trip documents" }).waitFor({ timeout: 30000 });

  // ---- on the card
  const trip = cardOf(page, "Trip documents");
  await trip.locator("ul[aria-label='Pictures'] img").first().waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll("ul[aria-label='Pictures'] img")].every((i) => i.complete && i.naturalWidth > 0));
  check(`${width}px: the card shows its 2 pictures as small squares and its PDF as a bar with the size`, (await trip.locator("ul[aria-label='Pictures'] img").count()) === 2 && (await trip.getByRole("button", { name: "View PDF Visa application.pdf" }).innerText()).includes("850 KB"));
  check(`${width}px: a note without files has none of it`, (await cardOf(page, "Plain note").locator("ul").count()) === 0);
  check(`${width}px: a long file name is cut inside the card`, await (async () => {
    const bar = cardOf(page, "Long names").getByRole("button", { name: /^View PDF / });
    const [b, c] = [await bar.boundingBox(), await cardOf(page, "Long names").boundingBox()];
    return b.x + b.width <= c.x + c.width + 1;
  })());
  if (SHOTS && width === 390) await page.screenshot({ path: `${SHOTS}/note-files-card-390.png`, fullPage: false });

  // ---- a picture opens in the viewer, not in the editor
  await trip.getByRole("button", { name: "View picture Passport photo.jpg" }).click();
  const viewer = page.getByRole("dialog", { name: "Passport photo.jpg" });
  await viewer.locator("img").waitFor();
  await page.waitForFunction(() => document.querySelector("dialog[open] img[alt='Passport photo.jpg']")?.naturalWidth > 0);
  check(`${width}px: a picture opens large in a viewer with its name and size (the note's editor does not open)`, (await viewer.getByText("Picture · 195 KB").count()) === 1 && (await page.getByRole("dialog", { name: "Edit note" }).count()) === 0 && (await page.locator("dialog[open]").count()) === 1);
  check(`${width}px: the viewer offers Open full size and Download`, (await viewer.getByRole("link", { name: "Open full size" }).count()) === 1 && (await viewer.getByRole("link", { name: "Download" }).count()) === 1);
  if (SHOTS && width === 390) await page.screenshot({ path: `${SHOTS}/note-files-picture-390.png` });
  await viewer.getByRole("button", { name: "Close", exact: true }).last().click();
  await page.waitForFunction(() => document.querySelectorAll("dialog[open]").length === 0);

  // ---- a PDF opens page by page
  await trip.getByRole("button", { name: "View PDF Visa application.pdf" }).click();
  const pdfViewer = page.getByRole("dialog", { name: "Visa application.pdf" });
  await pdfViewer.locator("canvas").first().waitFor({ timeout: 30000 });
  await pdfViewer.getByText("3 pages").waitFor({ timeout: 30000 });
  check(`${width}px: a PDF has a place for each of its 3 pages inside the app`, (await pdfViewer.locator("[data-pdf-page]").count()) === 3);
  // Pages are drawn when they come near the screen: scrolling to the end draws the last one too.
  await pdfViewer.locator("[data-pdf-scroll]").evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await page.waitForFunction(() => document.querySelectorAll("dialog[open] canvas").length === 3, null, { timeout: 30000 });
  await pdfViewer.locator("[data-pdf-scroll]").evaluate((el) => el.scrollTo(0, 0));
  check(`${width}px: and all 3 pages are drawn after scrolling down`, (await pdfViewer.locator("canvas").count()) === 3);
  // wait until the first page has paint on it
  await page.waitForFunction(() => {
    const c = document.querySelector("dialog[open] canvas");
    if (!c || !c.width) return false;
    const data = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    for (let i = 0; i < data.length; i += 4 * 37) if (data[i] < 200) return true;
    return false;
  }, null, { timeout: 30000 });
  check(`${width}px: the pages show the text of the PDF (not blank)`, true);
  const w1 = await pdfViewer.locator("canvas").first().evaluate((c) => c.getBoundingClientRect().width);
  const box = await pdfViewer.locator("[data-pdf-scroll]").evaluate((el) => el.clientWidth);
  check(`${width}px: a page is as wide as the box at first`, Math.abs(w1 - (box - 16)) <= 12, JSON.stringify({ w1, box }));
  await pdfViewer.getByRole("button", { name: "Zoom in" }).click();
  await page.waitForTimeout(400);
  const w2 = await pdfViewer.locator("canvas").first().evaluate((c) => c.getBoundingClientRect().width);
  check(`${width}px: zoom in makes the pages wider (and the box scrolls sideways)`, w2 > w1 * 1.3 && (await pdfViewer.locator("[data-pdf-scroll]").evaluate((el) => el.scrollWidth > el.clientWidth)), JSON.stringify({ w1, w2 }));
  check(`${width}px: the zoom shows 150%`, (await pdfViewer.getByText("150%").count()) === 1);
  await pdfViewer.getByRole("button", { name: "Zoom out" }).click();
  const openLink = pdfViewer.getByRole("link", { name: "Open in new tab" });
  const downloadLink = pdfViewer.getByRole("link", { name: "Download" });
  check(`${width}px: Open in new tab uses the PDF already loaded (a blob), Download uses the saving address`, (await openLink.getAttribute("href")).startsWith("blob:") && (await openLink.getAttribute("target")) === "_blank" && (await downloadLink.getAttribute("href")).includes("download="));
  const m = await measure(page, width);
  check(`${width}px: the PDF viewer does not widen the page`, !m.zoomedOut && m.mainClipped === 0, JSON.stringify(m));
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/note-files-pdf-${width}.png` });
  await pdfViewer.getByRole("button", { name: "Close", exact: true }).last().click();
  await page.waitForFunction(() => document.querySelectorAll("dialog[open]").length === 0);

  // ---- a picture whose saved address has expired asks for a new one
  state.expiredOnce.add(fid(1));
  state.calls.length = 0;
  await page.reload();
  await page.getByRole("heading", { name: "Trip documents" }).waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll("ul[aria-label='Pictures'] img")].length === 2 && [...document.querySelectorAll("ul[aria-label='Pictures'] img")].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 15000 });
  check(`${width}px: a picture whose address stopped working is loaded again with a new one (once)`, state.calls.filter((c) => c.startsWith("GET /notes/1/files/01")).length === 1, JSON.stringify(state.calls));

  // ---- search finds a note by a file name
  await page.getByPlaceholder("Search notes").fill("passport photo");
  check(`${width}px: searching a file name finds the note`, (await page.locator("article").count()) === 1 && (await page.getByRole("heading", { name: "Trip documents" }).count()) === 1);
  await page.getByPlaceholder("Search notes").fill("");

  // ---- edit: saved files listed, view from the list, remove with a question
  await trip.getByRole("heading", { name: "Trip documents" }).click();
  const form = page.getByRole("dialog", { name: "Edit note" });
  await form.getByRole("list", { name: "Files of this note" }).waitFor();
  check(`${width}px: the editor lists the 3 saved files with kind and size`, (await form.getByRole("list", { name: "Files of this note" }).locator("li").count()) === 3 && (await form.getByText("PDF · 850 KB").count()) === 1);
  await form.getByRole("button", { name: "View Visa application.pdf" }).click();
  await page.getByRole("dialog", { name: "Visa application.pdf" }).locator("canvas").first().waitFor({ timeout: 30000 });
  check(`${width}px: a file can be viewed from the editor (the editor stays open behind it)`, (await page.locator("dialog[open]").count()) === 2);
  await page.getByRole("dialog", { name: "Visa application.pdf" }).getByRole("button", { name: "Close", exact: true }).last().click();
  await page.waitForFunction(() => document.querySelectorAll("dialog[open]").length === 1);

  state.calls.length = 0;
  await form.getByRole("button", { name: "Remove Ticket.jpg" }).click();
  const ask = page.getByRole("dialog", { name: "Remove this file?" });
  await ask.waitFor();
  check(`${width}px: removing asks first and says it is deleted for good`, (await ask.getByText("will be deleted for good").count()) === 1);
  await ask.getByRole("button", { name: "Remove file" }).click();
  await page.waitForFunction(() => document.querySelectorAll("ul[aria-label='Files of this note'] li").length === 2);
  check(`${width}px: the file is removed (DELETE sent) and leaves the list`, state.calls.some((c) => c === `DELETE /notes/1/files/02`) && (await form.getByRole("list", { name: "Files of this note" }).locator("li").count()) === 2, JSON.stringify(state.calls));

  // ---- add files to this note: a PDF, a picture, and a PDF that is too big
  const big = Buffer.concat([PDF, Buffer.alloc(5 * 1024 * 1024, 32)]);
  state.calls.length = 0;
  await form.locator("#note-files-input").setInputFiles([
    { name: "Receipt 7.pdf", mimeType: "application/pdf", buffer: PDF },
    { name: "Scan.png", mimeType: "image/jpeg", buffer: JPEG },
    { name: "Huge scan.pdf", mimeType: "application/pdf", buffer: big },
    { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") },
  ]);
  await form.getByText("added on save").first().waitFor({ timeout: 15000 });
  await form.getByRole("alert").waitFor();
  const staged = await form.getByText("added on save").count();
  const alert = await form.getByRole("alert").innerText();
  check(`${width}px: the chosen PDF and picture are listed (added on save); a too big PDF and a text file are refused with a clear message`, staged === 2 && alert.includes("Huge scan.pdf") && alert.includes("up to 4 MB") && alert.includes("“notes.txt”: Only pictures"), JSON.stringify({ staged, alert }));
  check(`${width}px: the picture is named as a JPEG`, (await form.getByText("Scan.jpg").count()) === 1);
  if (SHOTS && width === 390) await page.screenshot({ path: `${SHOTS}/note-files-form-390.png` });
  await form.getByRole("button", { name: "Do not add Receipt 7.pdf" }).click();
  check(`${width}px: a chosen file can be taken out before saving`, (await form.getByText("added on save").count()) === 1);
  await form.locator("#note-files-input").setInputFiles([{ name: "Receipt 7.pdf", mimeType: "application/pdf", buffer: PDF }]);
  await page.waitForFunction(() => document.querySelectorAll("dialog[open] ul[aria-label='Files of this note'] li").length === 4);
  await form.getByRole("button", { name: "Save note" }).click();
  await page.waitForFunction(() => document.querySelectorAll("dialog[open]").length === 0, null, { timeout: 15000 });
  check(`${width}px: saving sends the note, then each file as it is (PDF bytes, JPEG bytes) with its name`, state.calls.includes("PATCH /notes/1") && state.posted.length === 2 && state.posted.some((p) => p.name === "Scan.jpg" && p.type === "image/jpeg" && p.jpeg) && state.posted.some((p) => p.name === "Receipt 7.pdf" && p.type === "application/pdf" && p.head === "%PDF-" && p.size === PDF.length), JSON.stringify(state.posted));
  await page.getByText("Note saved").first().waitFor();
  await page.waitForFunction(() => {
    const card = [...document.querySelectorAll("article")].find((a) => a.textContent.includes("Trip documents"));
    return card?.querySelectorAll("ul[aria-label='Pictures'] li").length === 2 && card.querySelectorAll("ul[aria-label='PDF files'] li").length === 2;
  });
  check(`${width}px: after the refresh the card shows 2 pictures and 2 PDFs (one removed, two added)`, true);

  // ---- a note with 10 files has no room
  await cardOf(page, "Full note").getByRole("heading", { name: "Full note" }).click();
  const full = page.getByRole("dialog", { name: "Edit note" });
  await full.getByRole("button", { name: "No room for more files" }).waitFor();
  check(`${width}px: a note with 10 files cannot take more (the button says so and is off)`, await full.getByRole("button", { name: "No room for more files" }).isDisabled());
  await full.getByRole("button", { name: "Cancel" }).click();

  // ---- a new note with a file; when the file fails the note is still saved and the message says so
  state.calls.length = 0;
  state.posted.length = 0;
  state.failUpload = true;
  await page.getByRole("button", { name: "New Note" }).first().click();
  const fresh = page.getByRole("dialog", { name: "New note" });
  await fresh.getByLabel("Title").fill("Bank letter");
  await fresh.locator("#note-files-input").setInputFiles([{ name: "Letter.pdf", mimeType: "application/pdf", buffer: PDF }]);
  await fresh.getByText("added on save").waitFor({ timeout: 15000 });
  await fresh.getByRole("button", { name: "Add note" }).click();
  await page.getByText("The note is saved, but “Letter.pdf” was not added").waitFor({ timeout: 15000 });
  check(`${width}px: if only the file fails, the note is saved and the message says which file and why`, state.calls.includes("POST /notes/a") && state.posted.length === 1 && (await page.getByText("The file could not be saved. Please try again.").count()) >= 1);
  await page.waitForFunction(() => document.querySelectorAll("dialog[open]").length === 0);

  const end = await measure(page, width);
  check(`${width}px: no sideways scrolling on the Notes page`, !end.zoomedOut && end.mainClipped === 0 && end.offenders.length === 0, JSON.stringify(end));
  check(`${width}px: no page errors`, errors.length === 0, errors.join(" | "));
  await ctx.close();
}

await browser.close();
console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
