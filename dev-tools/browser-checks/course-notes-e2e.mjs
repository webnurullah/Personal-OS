// Browser check for course notes: the Notes card on the course page (autosave, "Make public" and its link) and the public page
// that anyone with the link can open without signing in.  The built app must be running on http://localhost:3123 (started with
// NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321: this script starts a stand-in database on that port for the public page).
// Run:  node course-notes-e2e.mjs   (SHOTS=<folder> saves pictures)
import http from "node:http";
import { launch, newPhone, apiMock, measure, BASE, TODAY, session } from "/home/user/Personal-OS/dev-tools/browser-checks/audit-lib.mjs";

let failures = 0;
const check = (name, ok, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  → " + extra : ""}`);
};

const TOKEN = "0f1e2d3c-4b5a-4968-8776-655443322110";
const LONG = "Unbroken" + "Segment".repeat(40);
const NOTES = `Key points\n\n- SEO needs patience, see https://moz.com/beginners-guide-to-seo, then practise.\n- Ads: <script>alert(1)</script> is shown as text.\n- javascript:alert(1) is not a link.\n- ${LONG}\n\nQuestions for the mentor:\n  1. What is a good CTR?`;

// ---- a stand-in database for the public page (the app's server asks it, like it asks Supabase)
const asked = [];
const store = new Map([[TOKEN, { title: "Digital Marketing", notes: NOTES, updated_at: "2026-10-10T08:30:00Z" }], ["aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", { title: "Empty one", notes: "", updated_at: null }]]);
const database = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    if (req.url.includes("/rpc/public_course_notes")) {
      const { p_token } = JSON.parse(body || "{}");
      asked.push(p_token);
      res.setHeader("content-type", "application/json");
      const row = store.get(p_token);
      return res.end(JSON.stringify(row ? [row] : []));
    }
    res.statusCode = 404;
    res.end("{}");
  });
});
await new Promise((resolve, reject) => database.once("error", reject).listen(54321, "127.0.0.1", resolve));

const course = { id: "c1", title: "Digital Marketing", subtitle: "", category: "", status: "active", start_date: "2026-09-14", target_date: "2026-12-31", color: "blue", est_hours: 10, done_hours: 2, spent_hours: 2, percent: 20, topic_count: 3, unit_count: 1, days_left: 86, quote: "", weekly_plan: [], notes: "Old note", notes_share: null, notes_updated_at: "2026-10-01T00:00:00Z" };
const browser = await launch();

for (const width of [390, 320, 1280]) {
  const wide = width >= 1000;
  const ctx = wide ? await browser.newContext({ viewport: { width, height: 900 } }) : await newPhone(browser, width);
  if (wide) await ctx.addCookies([{ name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), url: BASE }]);
  let row = { ...course };
  const calls = [];
  await apiMock(ctx, { "/courses/c1": () => ({ today: TODAY, course: row, units: [{ id: "u1", course_id: "c1", code: "1", title: "SEO", color: "blue", position: 0, topics: [] }] }) });
  await ctx.route(/\/api\/courses\/c1\/notes$/, async (route) => {
    const body = route.request().postDataJSON();
    calls.push(body);
    if (failNext) { failNext = false; return route.fulfill({ status: 500, json: { error: { message: "Something went wrong." } } }); }
    if (body.notes !== undefined) row = { ...row, notes: body.notes, notes_updated_at: "2026-10-11T00:00:00Z" };
    if (body.public === true) row = { ...row, notes_share: row.notes_share ?? TOKEN };
    if (body.public === false) row = { ...row, notes_share: null };
    return route.fulfill({ json: { id: "c1", notes: row.notes, notes_share: row.notes_share, notes_updated_at: row.notes_updated_at } });
  });
  let failNext = false;
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE }).catch(() => undefined);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/learning/c1`);
  const box = page.getByLabel("Notes about this course");
  await box.waitFor();

  // ---- the Notes card
  check(`${width}px: the course page has a Notes card with the saved notes, private by default`, (await box.inputValue()) === "Old note" && (await page.getByRole("switch", { name: "Make these notes public" }).getAttribute("aria-checked")) === "false" && (await page.getByText("Private: only you can see them").count()) === 1);
  check(`${width}px: the card sits above the topics`, (await page.locator("#notes-title").boundingBox()).y < (await page.locator("#topics-title").boundingBox()).y);
  let m = await measure(page, width);
  check(`${width}px: the course page does not overflow with the Notes card`, !m.zoomedOut && m.mainClipped === 0 && m.offenders.length === 0, JSON.stringify(m));

  await box.fill("First line\n\nSecond line https://example.com");
  await page.waitForTimeout(150);
  check(`${width}px: typing shows "Not saved yet", and nothing is sent while you type`, (await page.getByText("Not saved yet").count()) === 1 && calls.length === 0);
  await page.waitForTimeout(1300);
  check(`${width}px: a moment after you stop it is saved by itself, line breaks kept`, calls.length === 1 && calls[0].notes === "First line\n\nSecond line https://example.com" && !("public" in calls[0]), JSON.stringify(calls));
  check(`${width}px: and says Saved`, (await page.getByText("Saved", { exact: true }).count()) === 1);

  // leaving the box saves at once
  calls.length = 0;
  await box.fill("Saved on leaving");
  await page.getByRole("heading", { name: "Notes" }).click();
  await page.waitForTimeout(400);
  check(`${width}px: leaving the box saves at once (not after the wait)`, calls.length === 1 && calls[0].notes === "Saved on leaving", JSON.stringify(calls));

  // a failed save says so and can be tried again
  calls.length = 0;
  failNext = true;
  await box.fill("This one fails first");
  await page.waitForTimeout(1400);
  check(`${width}px: a save that fails says so and the text stays`, (await page.getByText("Could not save").count()) >= 1 && (await box.inputValue()) === "This one fails first");
  await page.getByRole("button", { name: "Try again" }).click();
  await page.waitForTimeout(400);
  check(`${width}px: "Try again" saves it`, calls.length === 2 && calls[1].notes === "This one fails first" && (await page.getByText("Saved", { exact: true }).count()) === 1, JSON.stringify(calls));

  // ---- Make public
  calls.length = 0;
  const toggle = page.getByRole("switch", { name: "Make these notes public" });
  await box.fill("Typed just before publishing");
  await toggle.click();
  const ask = page.getByRole("dialog").filter({ hasText: "Make these notes public?" });
  await ask.waitFor();
  check(`${width}px: turning it on asks first, and says anyone with the link can read the notes (nothing is public yet)`, /Anyone who has the link can read these notes/.test(await ask.innerText()) && calls.every((c) => c.public === undefined));
  await ask.getByRole("button", { name: "Cancel" }).click();
  await page.waitForTimeout(200);
  check(`${width}px: Cancel leaves it private`, (await toggle.getAttribute("aria-checked")) === "false" && calls.every((c) => c.public === undefined));
  await toggle.click();
  await ask.getByRole("button", { name: "Make public" }).click();
  await page.getByRole("textbox", { name: "Public link to these notes" }).waitFor();
  const shown = await page.getByRole("textbox", { name: "Public link to these notes" }).inputValue();
  check(`${width}px: the text typed just before is saved first, then the link is made`, calls.length === 2 && calls[0].notes === "Typed just before publishing" && calls[1].public === true && !("notes" in calls[1]), JSON.stringify(calls));
  // typing and publishing without leaving the box: the pending text is saved by the Make public step
  calls.length = 0;
  check(`${width}px: the card shows the public link on this site, and says it is public`, shown === `${BASE}/shared/course/${TOKEN}` && (await toggle.getAttribute("aria-checked")) === "true" && (await page.getByText(/Public: anyone with the link can read/).count()) === 1, shown);
  m = await measure(page, width);
  check(`${width}px: the page does not overflow with the link shown`, !m.zoomedOut && m.mainClipped === 0 && m.offenders.length === 0, JSON.stringify(m));
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/course-notes-${width}.png`, fullPage: true });
  await page.getByRole("button", { name: "Copy link" }).click();
  await page.waitForTimeout(200);
  const copied = await page.evaluate(() => navigator.clipboard.readText()).catch(() => "(no clipboard)");
  check(`${width}px: Copy link copies the address`, copied === shown || copied === "(no clipboard)", copied);
  const open = page.getByRole("link", { name: "Open" });
  check(`${width}px: Open goes to the public page in a new tab`, (await open.getAttribute("href")) === shown && (await open.getAttribute("target")) === "_blank" && /noopener/.test((await open.getAttribute("rel")) ?? ""));

  // ---- turning it off
  calls.length = 0;
  await toggle.click();
  await page.waitForTimeout(500);
  check(`${width}px: turning it off needs no question and stops the link`, calls.length === 1 && calls[0].public === false && (await toggle.getAttribute("aria-checked")) === "false" && (await page.getByRole("textbox", { name: "Public link to these notes" }).count()) === 0, JSON.stringify(calls));
  check(`${width}px: no page errors on the course page`, errors.length === 0, errors.join(" | "));
  await ctx.close();
}

// ---- the public page: no sign-in, only the notes
for (const width of [390, 320, 1280]) {
  const ctx = width >= 1000 ? await browser.newContext({ viewport: { width, height: 900 } }) : await newPhone(browser, width);
  const page = await ctx.newPage(); // (no sign-in cookie, no saved session)
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  const response = await page.goto(`${BASE}/shared/course/${TOKEN}`);
  check(`${width}px public: the page opens without signing in`, response.status() === 200 && new URL(page.url()).pathname === `/shared/course/${TOKEN}`);
  check(`${width}px public: it shows the course title and when it was updated`, (await page.getByRole("heading", { level: 1 }).innerText()) === "Digital Marketing" && (await page.getByText(/Updated 10 Oct 2026/).count()) === 1);
  const article = page.getByRole("article", { name: "Notes" });
  const shownText = await article.innerText();
  check(`${width}px public: the notes are shown with their line breaks and indent`, shownText.includes("Key points\n\n- SEO needs patience") && shownText.includes("  1. What is a good CTR?"));
  check(`${width}px public: markup in the notes is shown as text, not run`, shownText.includes("<script>alert(1)</script>") && (await page.locator("article script").count()) === 0 && errors.length === 0);
  const links = await article.locator("a").evaluateAll((els) => els.map((e) => [e.getAttribute("href"), e.getAttribute("target"), e.getAttribute("rel")]));
  check(`${width}px public: only the web address is a link (https://moz.com/…, without the comma), opening in a new tab`, links.length === 1 && links[0][0] === "https://moz.com/beginners-guide-to-seo" && links[0][1] === "_blank" && /noopener/.test(links[0][2]) && /nofollow/.test(links[0][2]), JSON.stringify(links));
  check(`${width}px public: nothing of the app is shown (no menu, no sidebar, no sign-in button)`, (await page.locator("aside, nav").count()) === 0 && (await page.getByText("Dashboard").count()) === 0);
  check(`${width}px public: search engines are asked to stay away`, /noindex/.test((await page.locator('meta[name="robots"]').getAttribute("content")) ?? ""));
  check(`${width}px public: the tab is named after the course`, /Digital Marketing/.test(await page.title()));
  const wideScroll = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, inner: window.innerWidth }));
  check(`${width}px public: it does not overflow (a 300-letter word in the notes)`, wideScroll.doc <= wideScroll.inner, JSON.stringify(wideScroll));
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/course-notes-public-${width}.png`, fullPage: true });

  const before = asked.length;
  const empty = await page.goto(`${BASE}/shared/course/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee`);
  check(`${width}px public: a public course with no notes says so`, empty.status() === 200 && (await page.getByText("There are no notes yet.").count()) === 1);
  const gone = await page.goto(`${BASE}/shared/course/11111111-2222-4333-8444-555555555555`);
  check(`${width}px public: a code that is not (or no longer) public gives a 404 and a plain message`, gone.status() === 404 && (await page.getByText("This link is not available").count()) === 1 && (await page.getByText("Digital Marketing").count()) === 0);
  const asks = asked.length;
  const junk = await page.goto(`${BASE}/shared/course/not-a-code`);
  check(`${width}px public: a mistyped address gives the same 404 and the database is not even asked`, junk.status() === 404 && (await page.getByText("This link is not available").count()) === 1 && asked.length === asks, `${asked.length - asks} asked`);
  check(`${width}px public: the database was asked with the exact code`, asked.slice(before).every((t) => /^[0-9a-f-]{36}$/.test(t)));
  check(`${width}px public: no page errors`, errors.length === 0, errors.join(" | "));
  await ctx.close();
}

await browser.close();
database.close();
console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
