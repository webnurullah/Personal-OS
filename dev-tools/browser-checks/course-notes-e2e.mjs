// Browser check for the course notes: the text editor in the Notes card on the course page (formatting, links, autosave, saving on
// leaving the box, a failed save, typing while a save is on its way, stored HTML that must not run).
// The built app must be running on http://localhost:3123.   Run:  node course-notes-e2e.mjs   (SHOTS=<folder> saves pictures)
import { launch, newPhone, apiMock, measure, BASE, TODAY, session } from "/home/user/Personal-OS/dev-tools/browser-checks/audit-lib.mjs";

let failures = 0;
const check = (name, ok, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  → " + extra : ""}`);
};

const course = { id: "c1", title: "Digital Marketing", subtitle: "", category: "", status: "active", start_date: "2026-09-14", target_date: "2026-12-31", color: "blue", est_hours: 10, done_hours: 2, spent_hours: 2, percent: 20, topic_count: 3, unit_count: 1, days_left: 86, quote: "", weekly_plan: [], notes: "<h2>Old heading</h2><p>Old note with <strong>bold</strong> and a <a href=\"https://moz.com/\">link</a>.</p><ul><li><p>first</p></li><li><p>second</p></li></ul>", notes_updated_at: "2026-10-01T00:00:00Z" };
const STYLED = `<p>A <a class="btn btn-primary" title="x" rel="" target="_self" href="https://example.com/styled">styled link</a> pasted from another site</p>`;
const UNSAFE = `<script>window.__ran = 1</script><p onclick="window.__ran = 1">Click me</p><img src="x" onerror="window.__ran = 1"><iframe src="https://example.com"></iframe><p>Safe text <a href="javascript:window.__ran = 1">bad link</a> <a href="https://example.com/ok" onmouseover="window.__ran = 1">good link</a></p>`;
const browser = await launch();

for (const width of [390, 320, 1280]) {
  const wide = width >= 1000;
  const ctx = wide ? await browser.newContext({ viewport: { width, height: 900 } }) : await newPhone(browser, width);
  if (wide) await ctx.addCookies([{ name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), url: BASE }]);
  let row = { ...course };
  const calls = [];
  let failNext = false;
  let delayMs = 0;
  await apiMock(ctx, { "/courses/c1": () => ({ today: TODAY, course: row, units: [{ id: "u1", course_id: "c1", code: "1", title: "SEO", color: "blue", position: 0, topics: [] }] }) });
  await ctx.route(/\/api\/courses\/c1\/notes$/, async (route) => {
    const body = route.request().postDataJSON();
    calls.push(body);
    const wait = delayMs;
    delayMs = 0;
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    if (failNext) { failNext = false; return route.fulfill({ status: 500, json: { error: { message: "Something went wrong." } } }); }
    row = { ...row, notes: body.notes, notes_updated_at: "2026-10-11T00:00:00Z" };
    return route.fulfill({ json: { id: "c1", notes: row.notes, notes_updated_at: row.notes_updated_at } });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/learning/c1`);
  const editor = page.getByRole("textbox", { name: "Notes about this course" });
  await editor.waitFor();
  const html = () => editor.evaluate((el) => el.innerHTML);

  // ---- the card
  check(`${width}px: the notes are shown formatted in the editor (heading, bold, link, list)`, (await editor.locator("h2").innerText()) === "Old heading" && (await editor.locator("strong").innerText()) === "bold" && (await editor.locator("a").getAttribute("href")) === "https://moz.com/" && (await editor.locator("li").count()) === 2);
  check(`${width}px: it is a simple note: a toolbar, nothing about public or private`, (await page.getByRole("toolbar", { name: "Text formatting" }).count()) === 1 && (await page.getByRole("switch").count()) === 0 && (await page.locator("#notes-title").locator("xpath=ancestor::section").getByText(/public|private/i).count()) === 0);
  {
    const y = async (selector) => (await page.locator(selector).first().boundingBox()).y;
    const [topics, playlists, notes] = [await y("#topics-title"), await y("section[aria-labelledby='library-title']"), await y("#notes-title")];
    check(`${width}px: the Notes card comes after the Topics and the Courses & playlists sections`, topics < playlists && playlists < notes, JSON.stringify({ topics, playlists, notes }));
  }
  let m = await measure(page, width);
  check(`${width}px: the course page does not overflow with the editor`, !m.zoomedOut && m.mainClipped === 0 && m.offenders.length === 0, JSON.stringify(m));
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/course-notes-${width}.png`, fullPage: true });

  // ---- typing is saved by itself, as HTML, and only the notes are sent
  await editor.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.type("Hello world");
  await page.waitForTimeout(150);
  check(`${width}px: typing shows "Not saved yet", and nothing is sent while you type`, (await page.getByText("Not saved yet").count()) === 1 && calls.length === 0);
  await page.waitForTimeout(1300);
  check(`${width}px: a moment after you stop it is saved by itself (only the notes are sent)`, calls.length === 1 && JSON.stringify(calls[0]) === JSON.stringify({ notes: "<p>Hello world</p>" }), JSON.stringify(calls));
  check(`${width}px: and says Saved`, (await page.getByText("Saved", { exact: true }).count()) === 1);

  // ---- formatting with the toolbar
  calls.length = 0;
  await page.keyboard.press("Control+A");
  await page.getByRole("button", { name: "Bold" }).click();
  check(`${width}px: Bold makes the selected text bold and shows the button pressed`, (await html()).includes("<strong>Hello world</strong>") && (await page.getByRole("button", { name: "Bold" }).getAttribute("aria-pressed")) === "true");
  await page.getByRole("button", { name: "Italic" }).click();
  await page.getByRole("button", { name: "Underline" }).click();
  check(`${width}px: Italic and Underline work`, /<em>/.test(await html()) && /<u>/.test(await html()));
  await page.getByRole("button", { name: "Bold" }).click();
  await page.getByRole("button", { name: "Italic" }).click();
  await page.getByRole("button", { name: "Underline" }).click();
  await page.getByRole("button", { name: "Heading", exact: true }).click();
  check(`${width}px: Heading makes a heading`, (await editor.locator("h2").innerText()) === "Hello world");
  await page.getByRole("button", { name: "Heading", exact: true }).click();
  await page.getByRole("button", { name: "Bullet list" }).click();
  check(`${width}px: Bullet list makes a list`, (await editor.locator("ul li").count()) === 1);
  await page.getByRole("button", { name: "Bullet list" }).click();
  await page.getByRole("button", { name: "Numbered list" }).click();
  check(`${width}px: Numbered list makes a numbered list`, (await editor.locator("ol li").count()) === 1);
  await page.getByRole("button", { name: "Numbered list" }).click();
  await page.getByRole("button", { name: "Quote" }).click();
  check(`${width}px: Quote makes a quote`, (await editor.locator("blockquote").count()) === 1);
  await page.getByRole("button", { name: "Quote" }).click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Second paragraph");
  check(`${width}px: Enter starts a new paragraph`, (await editor.locator("p").count()) === 2);

  // ---- links
  await page.keyboard.press("Shift+Home");
  await page.getByRole("button", { name: "Link" }).click();
  const addressBox = page.getByRole("textbox", { name: "Link address" });
  await addressBox.waitFor();
  await addressBox.fill("javascript:alert(1)");
  await page.getByRole("button", { name: "Add link" }).click();
  check(`${width}px: a link that is not a web address is refused, and no link is made`, (await page.getByRole("alert").filter({ hasText: "does not look like a web address" }).count()) === 1 && (await editor.locator("a").count()) === 0);
  await addressBox.fill("example.com/learn");
  await page.getByRole("button", { name: "Add link" }).click();
  const link = editor.locator("a");
  check(`${width}px: a typed address becomes a link (https:// added), opening in a new tab`, (await link.getAttribute("href")) === "https://example.com/learn" && (await link.getAttribute("target")) === "_blank" && /noopener/.test((await link.getAttribute("rel")) ?? ""), await html());
  await page.getByRole("button", { name: "Link" }).click();
  await page.getByRole("textbox", { name: "Link address" }).fill("");
  await page.getByRole("button", { name: "Update link" }).click();
  check(`${width}px: an empty address takes the link away again`, (await editor.locator("a").count()) === 0);

  // ---- undo and redo
  await page.getByRole("button", { name: "Undo" }).click();
  check(`${width}px: Undo brings the link back`, (await editor.locator("a").count()) === 1);
  await page.getByRole("button", { name: "Redo" }).click();
  check(`${width}px: Redo takes it away again`, (await editor.locator("a").count()) === 0);

  // ---- leaving the box saves at once
  calls.length = 0;
  await editor.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.type("Saved on leaving");
  await page.getByRole("heading", { name: "Notes" }).click();
  await page.waitForTimeout(450);
  check(`${width}px: leaving the editor saves at once (not after the wait)`, calls.length === 1 && calls[0].notes === "<p>Saved on leaving</p>", JSON.stringify(calls));
  check(`${width}px: using a toolbar button does not count as leaving (no save in between)`, await (async () => {
    calls.length = 0;
    await editor.click();
    await page.keyboard.press("Control+A");
    await page.getByRole("button", { name: "Bold" }).click();
    await page.waitForTimeout(300);
    return calls.length === 0;
  })());
  await page.waitForTimeout(1200);

  // ---- links: written without a selection, opened with Ctrl+click, not made from file names, no toggle roles
  calls.length = 0;
  await editor.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Backspace");
  await page.getByRole("button", { name: "Link" }).click();
  await page.getByRole("textbox", { name: "Link address" }).fill("example.com/docs");
  await page.getByRole("button", { name: "Add link" }).click();
  check(`${width}px: "Add link" with nothing selected writes the address as the link`, (await editor.locator("a").innerText()) === "example.com/docs" && (await editor.locator("a").getAttribute("href")) === "https://example.com/docs", await html());
  await page.keyboard.press("End");
  await page.keyboard.type(" and main.py and README.md then https://example.org/x ");
  check(`${width}px: only real addresses become links by themselves (not main.py or README.md)`, JSON.stringify(await editor.locator("a").evaluateAll((els) => els.map((e) => e.getAttribute("href")))) === JSON.stringify(["https://example.com/docs", "https://example.org/x"]), await html());
  if (wide) {
    const popup = ctx.waitForEvent("page", { timeout: 3000 }).catch(() => null);
    await editor.locator("a").first().click({ modifiers: ["Control"] });
    const opened = await popup;
    check(`${width}px: Ctrl+click on a link opens it in a new tab`, opened !== null, opened ? "opened" : "no tab");
    await opened?.close();
  }
  await editor.locator("a").first().click();
  await page.getByRole("button", { name: "Link" }).click();
  check(`${width}px: with the cursor in a link, the link box shows its address and an Open link`, (await page.getByRole("textbox", { name: "Link address" }).inputValue()) === "https://example.com/docs" && (await page.getByRole("link", { name: "Open link" }).getAttribute("href")) === "https://example.com/docs");
  await page.getByRole("button", { name: "Cancel" }).click();
  check(`${width}px: only the real toggles say pressed (not Link, Undo or Redo)`, (await page.getByRole("button", { name: "Link" }).getAttribute("aria-pressed")) === null && (await page.getByRole("button", { name: "Undo" }).getAttribute("aria-pressed")) === null && (await page.getByRole("button", { name: "Redo" }).getAttribute("aria-pressed")) === null && (await page.getByRole("button", { name: "Bold" }).getAttribute("aria-pressed")) !== null);
  await page.waitForTimeout(1300);

  // ---- notes changed in another tab or phone are loaded, and Undo does not bring the older notes back
  calls.length = 0;
  row = { ...row, notes: "<p>Written on the phone</p>", notes_updated_at: "2026-10-12T00:00:00Z" };
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForFunction(() => document.querySelector(".rich-text")?.textContent === "Written on the phone", null, { timeout: 4000 }).catch(() => undefined);
  check(`${width}px: notes saved elsewhere appear when the page gets the focus again`, (await editor.innerText()) === "Written on the phone");
  check(`${width}px: and Undo has nothing to undo (it cannot bring the older notes back and save them)`, (await page.getByRole("button", { name: "Undo" }).isDisabled()) && calls.length === 0, JSON.stringify(calls));

  // ---- the same text typed later keeps its runs of spaces
  await editor.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.type("a    b");
  await page.waitForTimeout(1300);
  check(`${width}px: runs of spaces are saved as typed`, calls.length === 1 && calls[0].notes === "<p>a    b</p>", JSON.stringify(calls));

  // ---- an empty note is saved as empty text, not as an empty paragraph
  calls.length = 0;
  await editor.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Backspace");
  await page.waitForTimeout(1300);
  check(`${width}px: clearing everything saves empty notes (no empty paragraph)`, calls.length === 1 && calls[0].notes === "", JSON.stringify(calls));
  check(`${width}px: an empty editor shows what to write`, (await editor.locator("p.is-editor-empty").getAttribute("data-placeholder"))?.startsWith("Write what you want to remember") === true);

  // ---- a failed save says so and can be tried again
  calls.length = 0;
  failNext = true;
  await page.keyboard.type("This one fails first");
  await page.waitForTimeout(1400);
  check(`${width}px: a save that fails says so, and the text stays`, (await page.getByText("Could not save").count()) >= 1 && (await editor.innerText()).includes("This one fails first"));
  await page.getByRole("button", { name: "Try again" }).click();
  await page.waitForTimeout(400);
  check(`${width}px: "Try again" saves it`, calls.length === 2 && calls[1].notes === "<p>This one fails first</p>" && (await page.getByText("Saved", { exact: true }).count()) === 1, JSON.stringify(calls));

  // ---- a save that failed is tried once more when you switch away
  calls.length = 0;
  failNext = true;
  await editor.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.type("Typed before the connection dropped");
  await page.waitForTimeout(1400);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(500);
  check(`${width}px: after a failed save, switching away tries once more and stores the text`, calls.length === 2 && calls[1].notes === "<p>Typed before the connection dropped</p>", JSON.stringify(calls));
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });

  // ---- too long: said once, in the status line, and the older shorter text is not saved in its place
  calls.length = 0;
  await editor.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.type("short");
  await page.evaluate(() => document.execCommand("insertText", false, "x".repeat(100100)));
  await page.waitForTimeout(1500);
  check(`${width}px: notes that are too long say "Too long to save" and nothing is sent (not even the older short text)`, (await page.getByText("Too long to save", { exact: true }).count()) === 1 && calls.length === 0 && (await page.getByText("Saved", { exact: true }).count()) === 0, JSON.stringify(calls.map((c) => c.notes.length)));
  await page.keyboard.press("Control+A");
  await page.keyboard.type("Back to normal");
  await page.waitForTimeout(1400);
  check(`${width}px: and typing a shorter text saves again`, calls.length === 1 && calls[0].notes === "<p>Back to normal</p>" && (await page.getByText("Saved", { exact: true }).count()) === 1, JSON.stringify(calls.map((c) => c.notes.slice(0, 30))));

  // ---- typing while a save is on its way: nothing typed is lost or put back, and the last text is the last one stored
  calls.length = 0;
  delayMs = 1000;
  await editor.click();
  await page.keyboard.press("Control+A");
  await page.keyboard.type("ab");
  await page.waitForTimeout(1100); // the save of "ab" has started and waits for its answer
  await page.keyboard.type("c");
  const seen = new Set();
  for (let i = 0; i < 25; i++) {
    seen.add(await editor.innerText());
    await page.waitForTimeout(100);
  }
  check(`${width}px: text typed while a save is in flight stays in the editor (never put back to the older text)`, JSON.stringify([...seen]) === JSON.stringify(["abc"]), JSON.stringify([...seen]));
  await page.waitForTimeout(800);
  check(`${width}px: the last text typed is the last one sent, and the status ends at Saved`, calls.length === 2 && calls[0].notes === "<p>ab</p>" && calls[1].notes === "<p>abc</p>" && (await page.getByText("Saved", { exact: true }).count()) === 1, JSON.stringify(calls));
  check(`${width}px: no page errors on the course page`, errors.length === 0, errors.join(" | "));
  await ctx.close();
}

// ---- stored HTML never runs: scripts, event handlers, frames and javascript: links are dropped when the notes are opened
{
  const ctx = await newPhone(browser, 390);
  await apiMock(ctx, { "/courses/c1": { today: TODAY, course: { ...course, notes: UNSAFE }, units: [] } });
  await ctx.route(/\/api\/courses\/c1\/notes$/, (route) => route.fulfill({ json: { id: "c1", notes: "", notes_updated_at: null } }));
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/learning/c1`);
  const editor = page.getByRole("textbox", { name: "Notes about this course" });
  await editor.waitFor();
  await page.getByText("Click me").click();
  await page.waitForTimeout(300);
  const inside = await editor.evaluate((el) => ({ scripts: el.querySelectorAll("script, img, iframe").length, handlers: [...el.querySelectorAll("*")].filter((n) => [...n.attributes].some((a) => a.name.startsWith("on"))).length, hrefs: [...el.querySelectorAll("a")].map((a) => a.getAttribute("href")), ran: window.__ran ?? null }));
  check("stored HTML with a script, onclick, onerror, a frame and a javascript: link: none of it runs or is kept", inside.scripts === 0 && inside.handlers === 0 && inside.ran === null && JSON.stringify(inside.hrefs) === JSON.stringify(["https://example.com/ok"]), JSON.stringify(inside));
  check("and the safe text is still shown", (await editor.innerText()).includes("Safe text") && errors.length === 0, errors.join(" | "));
  await ctx.close();
}

// ---- a link pasted from a styled site keeps only its address (no class, title, target or rel from the other site)
{
  const ctx = await newPhone(browser, 390);
  await apiMock(ctx, { "/courses/c1": { today: TODAY, course: { ...course, notes: STYLED }, units: [] } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/learning/c1`);
  const editor = page.getByRole("textbox", { name: "Notes about this course" });
  await editor.waitFor();
  const attrs = await editor.locator("a").evaluate((a) => ({ class: a.getAttribute("class"), title: a.getAttribute("title"), rel: a.getAttribute("rel"), target: a.getAttribute("target"), href: a.getAttribute("href") }));
  check("a link with a class, title, rel and target of another site keeps only its address; rel and target are ours", attrs.class === null && attrs.title === null && attrs.rel === "noopener noreferrer nofollow" && attrs.target === "_blank" && attrs.href === "https://example.com/styled", JSON.stringify(attrs));
  await ctx.close();
}

// ---- a course kept in the browser before notes existed (no notes fields) opens without a crash
{
  const ctx = await newPhone(browser, 390);
  const { notes, notes_updated_at, ...old } = course;
  await apiMock(ctx, { "/courses/c1": { today: TODAY, course: old, units: [] } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/learning/c1`);
  const editor = page.getByRole("textbox", { name: "Notes about this course" });
  await editor.waitFor();
  check("a course answer without the notes fields shows an empty editor (no crash)", (await editor.innerText()).trim() === "" && errors.length === 0, errors.join(" | "));
  await ctx.close();
}

await browser.close();
console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
