// Browser check for Job Apply: the "Job URL" field and the picture of a job (choose → see it at once → saved with the job → shown on the card).
// The built app must be running on http://localhost:3123.   Run:  node job-image-e2e.mjs   (a stand-in API answers; SHOTS=<folder> saves pictures)
import zlib from "node:zlib";
import { launch, newPhone, apiMock, measure, BASE, TODAY, session } from "/home/user/Personal-OS/dev-tools/browser-checks/audit-lib.mjs";

let failures = 0;
const check = (name, ok, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  → " + extra : ""}`);
};

// A real PNG of the given size (a gradient), made without any library.
function png(width, height) {
  const crc = (buf) => {
    let c, crcv = 0xffffffff;
    for (let n = 0; n < buf.length; n++) {
      c = (crcv ^ buf[n]) & 0xff;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcv = (crcv >>> 8) ^ c;
    }
    return (crcv ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const head = Buffer.alloc(13);
  head.writeUInt32BE(width, 0);
  head.writeUInt32BE(height, 4);
  head[8] = 8; head[9] = 2; // 8-bit RGB
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    for (let x = 0; x < width; x++) {
      raw[row + 1 + x * 3] = (x * 255) / width;
      raw[row + 2 + x * 3] = (y * 255) / height;
      raw[row + 3 + x * 3] = (x * y) % 256;
    }
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", head), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

/** The width and height of a JPEG, read from its first "start of frame" marker. */
function jpegSize(buf) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    i += 2 + len;
  }
  return null;
}

const DOT = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const LONG = "Unbroken" + "Segment".repeat(14);
const job = (id, title, over = {}) => ({ id, url: "https://example.com/job", title, company: "Acme Inc", location: "Dhaka", deadline: null, status: "saved", applied_on: null, summary: "", requirements: [], skills: [], notes: "", image_url: null, created_at: "2026-10-01T00:00:00Z", ...over });

const browser = await launch();

for (const width of [390, 320, 1280]) {
  const wide = width >= 1000;
  const ctx = wide ? await browser.newContext({ viewport: { width, height: 900 } }) : await newPhone(browser, width);
  if (wide) await ctx.addCookies([{ name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), url: BASE }]);
  let list = [job("j1", "Sales lead", { image_url: DOT }), job("j2", LONG, { image_url: DOT }), job("j3", "No picture yet")];
  let failUpload = false;
  const calls = [];
  await apiMock(ctx, { "/jobs": () => ({ today: TODAY, items: list }), "/companies": { today: TODAY, items: [] } });
  await ctx.route(/\/api\/jobs(\/[^/]+)?(\/image)?$/, (route) => {
    const req = route.request();
    if (req.method() === "GET") return route.fallback();
    const path = new URL(req.url()).pathname.replace("/api", "");
    const type = req.headers()["content-type"] ?? "";
    const raw = type.startsWith("image/") ? req.postDataBuffer() : null;
    const body = raw ? null : req.postDataJSON?.() ?? null;
    calls.push({ method: req.method(), url: path, type, bytes: raw, body });
    const id = path.split("/")[2];
    if (path.endsWith("/image")) {
      if (req.method() === "POST" && failUpload) return route.fulfill({ status: 502, json: { error: "The picture could not be saved. Please try again." } });
      list = list.map((j) => (j.id === id ? { ...j, image_url: req.method() === "POST" ? DOT : null } : j));
      return route.fulfill({ json: list.find((j) => j.id === id) });
    }
    if (req.method() === "POST") {
      const made = job("jnew", body.title, { ...body });
      list = [made, ...list];
      return route.fulfill({ status: 201, json: made });
    }
    if (req.method() === "PATCH") {
      list = list.map((j) => (j.id === id ? { ...j, ...body } : j));
      return route.fulfill({ json: list.find((j) => j.id === id) });
    }
    return route.fulfill({ json: { ok: true } });
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/jobs`);
  await page.getByText("Sales lead").first().waitFor();

  // ---- the card: a saved picture shows as a small picture and opens large
  const thumb = page.getByRole("button", { name: "View the picture of Sales lead" });
  check(`${width}px: a job with a picture shows it on the card, one without does not`, (await thumb.count()) === 1 && (await page.getByRole("button", { name: "View the picture of No picture yet" }).count()) === 0);
  let m = await measure(page, width);
  check(`${width}px: the Applications tab does not overflow (picture + a 100-letter title)`, !m.zoomedOut && m.mainClipped === 0 && m.offenders.length === 0, JSON.stringify(m));
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/job-image-card-${width}.png`, fullPage: true });
  await thumb.click();
  const viewer = page.getByRole("dialog", { name: "Picture of the job post" });
  await viewer.getByRole("img").waitFor();
  check(`${width}px: tapping it opens the picture large, with a link to open it on its own`, (await viewer.getByRole("link", { name: "Open full size" }).getAttribute("href")) === DOT && (await viewer.getByRole("link", { name: "Open full size" }).getAttribute("target")) === "_blank");
  m = await measure(page, width);
  check(`${width}px: the viewer does not overflow`, !m.zoomedOut && m.mainClipped === 0 && m.offenders.length === 0, JSON.stringify(m));
  await viewer.getByRole("button", { name: "Close", exact: true }).last().click();
  await page.waitForTimeout(150);
  check(`${width}px: it closes`, (await page.getByRole("dialog", { name: "Picture of the job post" }).isVisible().catch(() => false)) === false);

  // ---- Add a job with a picture
  await page.getByRole("button", { name: /Add Job|Add job/ }).first().click();
  const form = page.getByRole("dialog").last();
  check(`${width}px: the form has a "Job URL" field and an "Upload image" button`, (await form.getByLabel("Job URL").count()) === 1 && (await form.getByRole("button", { name: "Upload image" }).count()) === 1);
  check(`${width}px: no picture is shown before one is chosen`, (await form.getByRole("img", { name: "The picture of this job" }).count()) === 0);

  // a file that is not a picture is refused right there
  await form.locator("#job-picture").setInputFiles({ name: "circular.png", mimeType: "image/png", buffer: Buffer.from("this is not a picture") });
  await form.getByRole("alert").waitFor();
  check(`${width}px: a file that is not a picture is refused with a message, nothing is shown`, /cannot be opened/.test(await form.getByRole("alert").innerText()) && (await form.getByRole("img", { name: "The picture of this job" }).count()) === 0);

  // a big picture is chosen: it shows at once
  await form.locator("#job-picture").setInputFiles({ name: "circular.png", mimeType: "image/png", buffer: png(3000, 1800) });
  const preview = form.getByRole("img", { name: "The picture of this job" });
  await preview.waitFor();
  check(`${width}px: the chosen picture is shown at once in the form (and the old message is gone)`, (await preview.getAttribute("src")).startsWith("blob:") && (await form.getByRole("alert").count()) === 0);
  check(`${width}px: the button now says "Change image" and there is "Remove image"`, (await form.getByRole("button", { name: "Change image" }).count()) === 1 && (await form.getByRole("button", { name: "Remove image" }).count()) === 1);
  m = await measure(page, width);
  check(`${width}px: the form with a picture does not overflow`, !m.zoomedOut && m.mainClipped === 0 && m.offenders.length === 0, JSON.stringify(m));
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/job-image-form-${width}.png` });
  await form.getByLabel("Job title").fill("New job with picture");
  await form.getByLabel("Job URL").fill("example.com/careers/1");
  calls.length = 0;
  await form.getByRole("button", { name: "Add Job" }).click();
  await page.waitForTimeout(800);
  const created = calls.find((c) => c.method === "POST" && c.url === "/jobs");
  const up = calls.find((c) => c.url === "/jobs/jnew/image");
  check(`${width}px: the job is saved first, then its picture is sent to that job`, Boolean(created) && Boolean(up) && calls.indexOf(created) < calls.indexOf(up), JSON.stringify(calls.map((c) => [c.method, c.url])));
  check(`${width}px: the job body has the URL and no picture data`, created?.body?.url === "https://example.com/careers/1" && !("image_url" in created.body) && !("image_path" in created.body), JSON.stringify(created?.body));
  const sent = up?.bytes;
  const size = sent && jpegSize(sent);
  check(`${width}px: the picture is sent as a JPEG, shrunk to 2000 px on its long side, under 2.5 MB`, up?.type === "image/jpeg" && sent[0] === 0xff && sent[1] === 0xd8 && size?.width === 2000 && size?.height === 1200 && sent.length < 2.5 * 1024 * 1024, JSON.stringify({ type: up?.type, size, bytes: sent?.length }));
  check(`${width}px: after saving, the new job shows its picture`, (await page.getByRole("button", { name: "View the picture of New job with picture" }).count()) === 1);

  // ---- Edit: the saved picture is shown in the form, can be removed
  calls.length = 0;
  await page.locator("article", { hasText: "Sales lead" }).getByRole("button", { name: "Edit job" }).click();
  const edit = page.getByRole("dialog").last();
  const current = edit.getByRole("img", { name: "The picture of this job" });
  await current.waitFor();
  check(`${width}px: editing a job shows its saved picture and the field is called Job URL`, (await current.getAttribute("src")) === DOT && (await edit.getByLabel("Job URL").inputValue()) === "https://example.com/job");
  await edit.getByRole("button", { name: "Remove image" }).click();
  check(`${width}px: "Remove image" takes it off the form`, (await edit.getByRole("img", { name: "The picture of this job" }).count()) === 0 && (await edit.getByRole("button", { name: "Upload image" }).count()) === 1);
  await edit.getByRole("button", { name: "Save changes" }).click();
  await page.waitForTimeout(800);
  check(`${width}px: saving sends the change, then removes the picture`, calls.some((c) => c.method === "PATCH" && c.url === "/jobs/j1") && calls.some((c) => c.method === "DELETE" && c.url === "/jobs/j1/image"), JSON.stringify(calls.map((c) => [c.method, c.url])));
  check(`${width}px: the card no longer shows a picture`, (await page.getByRole("button", { name: "View the picture of Sales lead" }).count()) === 0);

  // ---- Edit without touching the picture: nothing about it is sent
  calls.length = 0;
  await page.locator("article", { hasText: LONG }).getByRole("button", { name: "Edit job" }).click();
  await page.getByRole("dialog").last().getByRole("button", { name: "Save changes" }).click();
  await page.waitForTimeout(600);
  check(`${width}px: saving without touching the picture sends nothing about it`, calls.length === 1 && calls[0].method === "PATCH", JSON.stringify(calls.map((c) => [c.method, c.url])));

  // ---- the job is saved even when only its picture fails
  failUpload = true;
  calls.length = 0;
  await page.locator("article", { hasText: "No picture yet" }).getByRole("button", { name: "Edit job" }).click();
  const retry = page.getByRole("dialog").last();
  await retry.locator("#job-picture").setInputFiles({ name: "a.png", mimeType: "image/png", buffer: png(400, 300) });
  await retry.getByRole("img", { name: "The picture of this job" }).waitFor();
  await retry.getByRole("button", { name: "Save changes" }).click();
  await page.waitForTimeout(800);
  check(`${width}px: if only the picture fails, the job is saved and the message says so`, calls.some((c) => c.method === "PATCH") && (await page.getByText(/The job is saved, but its picture was not/).count()) >= 1, JSON.stringify(calls.map((c) => [c.method, c.url])));

  // ---- the Board view keeps working with pictures
  await page.getByRole("tab", { name: "Board" }).click();
  m = await measure(page, width);
  check(`${width}px: the Board does not overflow`, !m.zoomedOut && m.mainClipped === 0 && m.offenders.length === 0, JSON.stringify(m));
  await ctx.close();
}

await browser.close();
console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
