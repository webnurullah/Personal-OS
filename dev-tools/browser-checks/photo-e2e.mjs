import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
const base = "http://localhost:3124", MOCK = "http://localhost:4012", S = process.argv[2], T = "2026-10-06";
const UID = "11111111-1111-4111-8111-111111111111";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const TOKEN = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: UID, email: "me@example.com", role: "authenticated", exp: 9999999999 })}.sig`;
const now = Math.floor(Date.now() / 1000);
const session = { access_token: TOKEN, refresh_token: "r", token_type: "bearer", expires_in: 99999999, expires_at: now + 99999999, user: { id: UID, aud: "authenticated", email: "me@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
const cookie = { name: "sb-localhost-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), url: base };
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const out = [];
const check = (name, cond, extra = "") => { const l = `${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  → " + extra : ""}`; out.push(l); console.log(l); };
const state = async () => (await fetch(MOCK + "/__state")).json();
const errors = [];

async function newPage(viewport, { hasTouch = false, failImage = false, slowUpload = 0 } = {}) {
  const ctx = await browser.newContext({ viewport, hasTouch, isMobile: hasTouch, deviceScaleFactor: hasTouch ? 2 : 1 });
  await ctx.addCookies([cookie]);
  const uploads = [], deletes = [];
  await ctx.route("**/api/**", async (route) => {
    const req = route.request(), u = new URL(req.url()), p = u.pathname.replace("/api", "") + u.search;
    if (p.startsWith("/profile")) {
      if (req.method() === "POST" && p === "/profile/avatar") { uploads.push(req); if (slowUpload) await new Promise((r) => setTimeout(r, slowUpload)); }
      if (req.method() === "DELETE" && p === "/profile/avatar") deletes.push(req);
      return route.continue();
    }
    const ok = (json) => route.fulfill({ json });
    if (p === "/assistant") return ok({ ai: false });
    if (p === "/notifications") return ok({ items: [], unread: 0 });
    if (p === "/categories") return ok({ items: [] });
    if (p === "/tasks") return ok({ today: T, items: [{ id: "t1", title: "Call the bank", notes: "", priority: "medium", due_date: T, end_date: null, done_at: null, category_id: null, project_id: null, created_at: T }] });
    return ok({ items: [], today: T });
  });
  if (failImage) await ctx.route("**/storage/v1/object/public/**", (route) => route.fulfill({ status: 404, body: "gone" }));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push("PAGE " + e));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push("CONSOLE " + m.text()));
  return { ctx, page, uploads, deletes };
}
const box = async (loc) => (await loc.boundingBox());
const px = (page, x, y) => page.evaluate(([x, y]) => { const c = document.querySelector('[data-testid="avatar-preview"]'); const d = c.getContext("2d").getImageData(x, y, 1, 1).data; return [d[0], d[1], d[2]]; }, [x, y]);
const isColor = (c, want) => want === "white" ? c.every((v) => v > 235) : want === "red" ? c[0] > 180 && c[1] < 90 && c[2] < 90 : want === "blue" ? c[2] > 180 && c[0] < 90 : false;
/** Width and height of a JPEG from its first start-of-frame marker. */
const jpegSize = (buf) => { let i = 2; while (i < buf.length) { if (buf[i] !== 0xff) return null; const m = buf[i + 1]; const len = buf.readUInt16BE(i + 2); if (m >= 0xc0 && m <= 0xc3) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) }; i += 2 + len; } return null; };

// ================= 1. top bar on a phone =================
await fetch(MOCK + "/__reset");
{
  const { ctx, page } = await newPage({ width: 390, height: 844 }, { hasTouch: true });
  await page.goto(base + "/tasks");
  await page.getByText("Call the bank").waitFor();
  const avatar = page.getByRole("button", { name: "Account menu" }), menu = page.getByRole("button", { name: "Open menu" }), title = page.locator("header").getByText("Tasks", { exact: true });
  const a = await box(avatar), m = await box(menu), t = await box(title), bell = await box(page.getByRole("button", { name: "Notifications" })), search = await box(page.getByRole("button", { name: "Search" }));
  check("phone: profile circle is at the far left", a.x >= 8 && a.x <= 20 && a.width >= 36, `x=${a.x}`);
  check("phone: menu button is at the far right", m.x + m.width >= 390 - 12 && m.x > 300, `right edge=${m.x + m.width}`);
  check("phone: order is profile, title, search, bell, menu", a.x + a.width <= t.x + 1 && t.x + t.width <= search.x + 1 && search.x < bell.x && bell.x < m.x, JSON.stringify({ a: a.x, t: t.x, s: search.x, b: bell.x, m: m.x }));
  check("phone: only one Account menu and one Open menu button are visible", (await avatar.count()) === 1 && (await menu.count()) === 1);
  check("phone: page does not scroll sideways (drawer waits off-screen)", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await page.screenshot({ path: S + "/pb-phone-top.png" });

  // the page menu opens from the right
  const aside = page.getByRole("complementary", { name: "Main menu" });
  const closed = await box(aside);
  check("phone: closed menu is parked off the right edge", closed.x >= 389, `x=${closed.x}`);
  await menu.tap();
  await page.waitForTimeout(450);
  const open = await box(aside);
  check("phone: menu slides in from the right and touches the right edge", Math.abs(open.x + open.width - 390) < 2 && open.width >= 230, `x=${open.x} w=${open.width}`);
  const jobApply = await box(aside.getByRole("link", { name: "Job Apply" })), settingsLink = await box(aside.getByRole("link", { name: "Settings" }));
  check("phone: the menu shows Job Apply and Settings without scrolling", jobApply && settingsLink && jobApply.y + jobApply.height < 844 && settingsLink.y + settingsLink.height < 844, JSON.stringify({ job: jobApply?.y, settings: settingsLink?.y }));
  check("phone: the quote card is not squeezed in (it needs a tall screen)", !(await page.getByText("A better life is a series").isVisible()));
  await page.screenshot({ path: S + "/pb-phone-menu.png" });
  await aside.getByRole("link", { name: "Notes" }).tap();
  await page.waitForURL(base + "/notes");
  await page.waitForTimeout(450);
  check("phone: choosing a page closes the menu again", (await box(aside)).x >= 389);

  // the profile menu opens under the circle, inside the screen
  await avatar.tap();
  await page.getByRole("link", { name: "My profile" }).waitFor();
  const panel = await box(page.locator("div.absolute", { has: page.getByRole("link", { name: "My profile" }) }).first());
  check("phone: profile menu lines up with the circle and stays inside the screen", panel.x >= 0 && panel.x <= a.x + 4 && panel.x + panel.width <= 390, `x=${panel.x} w=${panel.width}`);
  await page.screenshot({ path: S + "/pb-phone-profile-menu.png" });
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "My profile" }).waitFor({ state: "hidden" });
  await ctx.close();
}

// ================= 2. tablet and desktop =================
{
  const { ctx, page } = await newPage({ width: 820, height: 1000 });
  await page.goto(base + "/tasks"); await page.getByText("Call the bank").waitFor();
  const a = await box(page.getByRole("button", { name: "Account menu" })), m = await box(page.getByRole("button", { name: "Open menu" }));
  check("tablet: profile left, menu right", a.x < 40 && m.x + m.width > 780, `profile x=${a.x}, menu right=${m.x + m.width}`);
  await page.screenshot({ path: S + "/pb-tablet.png" });
  await ctx.close();
}
{
  const { ctx, page } = await newPage({ width: 1440, height: 900 });
  await page.goto(base + "/tasks"); await page.getByText("Call the bank").waitFor();
  const a = await box(page.getByRole("button", { name: "Account menu" }));
  check("desktop: profile stays at the right", a.x > 1100, `x=${a.x}`);
  check("desktop: no menu button (the sidebar is always open)", (await page.getByRole("button", { name: "Open menu" }).count()) === 0 || !(await page.getByRole("button", { name: "Open menu" }).isVisible()));
  const side = await box(page.getByRole("complementary", { name: "Main menu" }));
  check("desktop: sidebar is at the left", side.x === 0 && side.width === 240, JSON.stringify(side));
  await page.getByRole("button", { name: "Account menu" }).click();
  const panel = await box(page.locator("div.absolute", { has: page.getByRole("link", { name: "My profile" }) }).first());
  check("desktop: profile menu opens leftwards from the circle, inside the screen", panel.x + panel.width <= 1440 && panel.x + panel.width >= a.x + a.width - 4, `panel right=${panel.x + panel.width}`);
  check("desktop: the quote card is still shown at 900 px high", await page.getByText("A better life is a series").isVisible());
  await page.screenshot({ path: S + "/pb-desktop.png" });
  await ctx.close();
}

// ================= 3. photo upload on a phone =================
await fetch(MOCK + "/__reset");
{
  const { ctx, page, uploads, deletes } = await newPage({ width: 390, height: 844 }, { hasTouch: true });
  await page.goto(base + "/settings");
  await page.getByRole("button", { name: "Upload photo" }).waitFor();
  check("settings: shows 'Upload photo' and no Remove while there is no photo", (await page.getByRole("button", { name: "Remove" }).count()) === 0);
  check("settings: the little drawing is shown until you add a photo", (await page.locator("main svg[viewBox='0 0 40 40']").count()) >= 1);
  await page.screenshot({ path: S + "/pb-settings-empty.png" });

  // a 5 MB phone photo
  await page.locator('input[type="file"]').setInputFiles(S + "/photo-big.jpg");
  const dialog = page.getByRole("dialog");
  await dialog.getByText("Adjust your photo").waitFor();
  await page.waitForFunction(() => !!document.querySelector('[data-testid="avatar-preview"]') && document.querySelector('[data-testid="avatar-preview"]').width === 512);
  await page.waitForTimeout(300);
  check("editor: the preview shows the middle of the photo (white marker in the centre)", isColor(await px(page, 256, 256 - 6), "white") || isColor(await px(page, 256, 256 + 6), "white"));
  check("editor: upper part red, lower part blue", isColor(await px(page, 60, 100), "red") && isColor(await px(page, 60, 420), "blue"));
  await page.screenshot({ path: S + "/pb-editor.png" });

  // zoom: the marker grows, so a point that was outside it at 1x is inside it at 2x
  check("editor: at 1x the point above the marker is red", isColor(await px(page, 256, 256 - 80), "red"));
  await page.getByRole("slider", { name: "Zoom" }).fill("2");
  await page.waitForTimeout(150);
  check("editor: at 2x the marker has grown over that point", isColor(await px(page, 256, 256 - 80), "white"));
  await page.getByRole("slider", { name: "Zoom" }).fill("1");
  await page.waitForTimeout(150);
  // drag with a finger (touch), 60 px to the right
  const frame = await box(page.getByRole("group", { name: /Photo position/ }));
  const cdp = await ctx.newCDPSession(page);
  const cx = frame.x + frame.width / 2, cy = frame.y + frame.height / 2;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: cx, y: cy }] });
  for (let i = 1; i <= 6; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: cx + i * 10, y: cy }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitForTimeout(200);
  // the preview is 256 CSS px = 512 canvas px, so 60 CSS px = 120 canvas px: the marker moves from x=256 to x=376
  check("editor: dragging with a finger moves the picture (marker now to the right)", isColor(await px(page, 376, 250), "white") && !isColor(await px(page, 256 - 70, 250), "white") && !isColor(await px(page, 256, 200), "white"), `centre now ${JSON.stringify(await px(page, 256, 256))}`);
  check("editor: the page did not scroll while dragging", (await page.evaluate(() => window.scrollY)) === 0);
  // arrow keys: five presses to the left (12 px each) bring the marker back to the middle
  await page.getByRole("group", { name: /Photo position/ }).focus();
  for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(200);
  check("editor: arrow keys move the picture too (left arrow moves it left)", isColor(await px(page, 256, 250), "white") && !isColor(await px(page, 376, 250), "white"));
  await page.screenshot({ path: S + "/pb-editor-moved.png" });

  // save
  const waitPost = page.waitForResponse((r) => r.url().endsWith("/api/profile/avatar") && r.request().method() === "POST");
  await dialog.getByRole("button", { name: "Use this photo" }).tap();
  const res = await waitPost;
  const req = uploads[0];
  const sent = req.postDataBuffer();
  const size = jpegSize(sent);
  check("upload: 5 MB photo became a small JPEG", res.status() === 200 && req.headers()["content-type"] === "image/jpeg" && sent.length < 80 * 1024 && sent[0] === 0xff && sent[1] === 0xd8, `${Math.round(sent.length / 1024)} KB, status ${res.status()}`);
  check("upload: the picture is 256 × 256", size?.w === 256 && size?.h === 256, JSON.stringify(size));
  check("upload: sent with the sign-in token", /^Bearer /.test(req.headers()["authorization"] ?? ""));
  await page.getByText("Profile photo saved").waitFor();
  await dialog.waitFor({ state: "hidden" });
  const st = await state();
  check("upload: the file is in the bucket and the profile points to it", Object.keys(st.files).length === 1 && st.avatar_path === Object.keys(st.files)[0]);
  const img = page.locator("main img[src*='/storage/v1/object/public/avatars/']");
  await img.waitFor();
  check("settings: the new photo is shown and really loaded", await img.evaluate((el) => el.complete && el.naturalWidth === 256), await img.getAttribute("src"));
  check("settings: button now says 'Change photo' and Remove appears", (await page.getByRole("button", { name: "Change photo" }).count()) === 1 && (await page.getByRole("button", { name: "Remove" }).count()) === 1);
  const topImg = page.locator("header img[src*='/storage/v1/object/public/avatars/']:visible");
  await topImg.waitFor();
  check("top bar: the same photo is in the round profile button at the left", (await box(page.getByRole("button", { name: "Account menu" })).then((b) => b.x)) < 20 && (await topImg.getAttribute("src")) === (await img.getAttribute("src")));
  await page.screenshot({ path: S + "/pb-settings-photo.png" });

  // survives a reload
  await page.reload();
  await page.locator("header img[src*='/storage/v1/object/public/avatars/']:visible").waitFor();
  check("after reload the photo is still there", true);

  // profile menu shows it too
  await page.getByRole("button", { name: "Account menu" }).tap();
  check("profile menu header shows the photo as well", (await page.locator("header img[src*='/storage/v1/object/public/avatars/']:visible").count()) === 2);
  await page.keyboard.press("Escape");

  // replace it with an upright-checking photo (EXIF orientation 6)
  await page.locator('input[type="file"]').setInputFiles(S + "/photo-exif6.jpg");
  await dialog.getByText("Adjust your photo").waitFor();
  await page.waitForFunction(() => document.querySelector('[data-testid="avatar-preview"]')?.width === 512);
  await page.waitForTimeout(300);
  check("editor: a sideways phone photo (EXIF) is turned upright (red on top, blue below)", isColor(await px(page, 100, 100), "red") && isColor(await px(page, 100, 420), "blue"), `${JSON.stringify(await px(page, 100, 100))} / ${JSON.stringify(await px(page, 100, 420))}`);
  await dialog.getByRole("button", { name: "Cancel" }).tap();
  await dialog.waitFor({ state: "hidden" });
  check("cancel: nothing was uploaded", uploads.length === 1);

  // see-through PNG: white behind it, not black
  await page.locator('input[type="file"]').setInputFiles(S + "/photo-transparent.png");
  await dialog.getByText("Adjust your photo").waitFor();
  await page.waitForFunction(() => document.querySelector('[data-testid="avatar-preview"]')?.width === 512);
  await page.waitForTimeout(300);
  check("editor: see-through parts of a PNG become white", isColor(await px(page, 20, 20), "white") && isColor(await px(page, 256, 256), "red"), JSON.stringify(await px(page, 20, 20)));
  await dialog.getByRole("button", { name: "Cancel" }).tap();

  // not a picture
  await page.locator('input[type="file"]').setInputFiles(S + "/not-a-photo.png");
  await dialog.getByText("Adjust your photo").waitFor();
  await dialog.getByRole("alert").waitFor();
  check("a text file named .png → friendly message, nothing to save", /cannot be opened/.test(await dialog.getByRole("alert").innerText()) && (await dialog.getByRole("button", { name: "Use this photo" }).isDisabled()), await dialog.getByRole("alert").innerText());
  await page.screenshot({ path: S + "/pb-editor-error.png" });
  await dialog.getByRole("button", { name: "Cancel" }).tap();

  // the server says no: the editor stays open with the message, then works on retry
  await fetch(MOCK + "/__fail?what=upload&times=1");
  await page.locator('input[type="file"]').setInputFiles(S + "/photo-transparent.png");
  await dialog.getByText("Adjust your photo").waitFor();
  await page.waitForFunction(() => document.querySelector('[data-testid="avatar-preview"]')?.width === 512);
  await dialog.getByRole("button", { name: "Use this photo" }).tap();
  await dialog.getByRole("alert").waitFor();
  check("server error: editor stays open and says why", /could not be saved/.test(await dialog.getByRole("alert").innerText()) && (await dialog.isVisible()));
  await dialog.getByRole("button", { name: "Use this photo" }).tap();
  await page.getByText("Profile photo saved").waitFor();
  await dialog.waitFor({ state: "hidden" });
  check("retry works, and exactly one file is kept", Object.keys((await state()).files).length === 1 && uploads.length === 3);

  // remove
  await page.getByRole("button", { name: "Remove" }).tap();
  await page.getByText("Profile photo removed").waitFor();
  check("remove: DELETE sent and the file is gone", deletes.length === 1 && Object.keys((await state()).files).length === 0 && (await state()).avatar_path === null);
  check("remove: the little drawing is back (settings and top bar)", (await page.locator("main img[src*='/storage/']").count()) === 0 && (await page.locator("header img[src*='/storage/']:visible").count()) === 0 && (await page.getByRole("button", { name: "Upload photo" }).count()) === 1);
  await ctx.close();
}

// ================= 4. a photo that cannot be loaded falls back to the drawing =================
await fetch(MOCK + "/__reset");
{
  // put a photo in the profile through the real route, then make the picture address answer 404
  const up = await fetch(base + "/api/profile/avatar", { method: "POST", headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "image/jpeg" }, body: (await import("node:fs")).readFileSync(S + "/photo-exif6.jpg") });
  check("(setup) photo saved through the real route", up.status === 200);
  const { ctx, page } = await newPage({ width: 390, height: 844 }, { hasTouch: true, failImage: true });
  await page.goto(base + "/settings");
  await page.getByRole("button", { name: "Change photo" }).waitFor();
  await page.waitForTimeout(500);
  check("broken photo address → the drawing is shown instead of a broken picture", (await page.locator("main img").count()) === 0 && (await page.locator("main svg[viewBox='0 0 40 40']").count()) >= 1 && (await page.locator("header svg[viewBox='0 0 40 40']:visible").count()) >= 1);
  await ctx.close();
}

// ================= 5. while a photo is being saved the window cannot be closed; narrow phones keep a square frame =================
await fetch(MOCK + "/__reset");
{
  const { ctx, page, uploads } = await newPage({ width: 320, height: 640 }, { hasTouch: true, slowUpload: 2500 });
  await page.goto(base + "/settings");
  await page.getByRole("button", { name: "Upload photo" }).waitFor();
  await page.locator('input[type="file"]').setInputFiles(S + "/photo-exif6.jpg");
  const dialog = page.getByRole("dialog");
  await dialog.getByText("Adjust your photo").waitFor();
  await page.waitForFunction(() => document.querySelector('[data-testid="avatar-preview"]')?.width === 512);
  const frame = await box(page.getByRole("group", { name: /Photo position/ }));
  check("320 px phone: the photo frame is square", Math.abs(frame.width - frame.height) < 1 && frame.width > 200, `${frame.width} x ${frame.height}`);
  await dialog.getByRole("button", { name: "Use this photo" }).tap();
  await page.waitForFunction(() => document.querySelector("dialog button[type=submit]")?.textContent?.includes("Saving"));
  check("while saving: Cancel and the X are disabled", (await dialog.getByRole("button", { name: "Cancel" }).isDisabled()) && (await dialog.getByRole("button", { name: "Close" }).isDisabled()));
  await page.keyboard.press("Escape"); await page.keyboard.press("Escape");
  await page.mouse.click(5, 5);
  await page.waitForTimeout(300);
  check("while saving: Esc (twice) and a tap outside do not close the window", await dialog.isVisible());
  await page.getByText("Profile photo saved").waitFor({ timeout: 8000 });
  await dialog.waitFor({ state: "hidden" });
  check("after saving the window closes by itself and exactly one upload happened", uploads.length === 1 && (await page.getByRole("button", { name: "Change photo" }).count()) === 1);
  await ctx.close();
}

console.log("\nconsole/page errors:", errors);
console.log(out.some((l) => l.startsWith("FAIL")) ? "SOME FAILED" : `ALL ${out.length} PASSED`);
await browser.close();
