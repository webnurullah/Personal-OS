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
  check(`${width}px: the card sits above the topics`, (await page.locator("#notes-title").boundingBox()).y < (await page.locator("#topics-title").boundingBox()).y);
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
