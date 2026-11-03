// Browser check for the event form: the note is a full-width text area, there is an "Event Link (optional)" field,
// the link is fixed up and checked on save, and it shows as an icon on the event in the agenda (the row still opens the editor).
// The app must be running on http://localhost:3123.   Run:  node event-link-e2e.mjs   (a stand-in API answers; SHOTS=<folder> saves pictures)
import { launch, newPhone, apiMock, measure, BASE, TODAY, session } from "/home/user/Personal-OS/dev-tools/browser-checks/audit-lib.mjs";

let failures = 0;
const check = (name, ok, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  → " + extra : ""}`);
};
const SHOTS = process.env.SHOTS;

const NOTE = "8th November: CV Making + Application Strategy\n15th November: Interview Skills\nBring a laptop and a printed CV.";
const LONG_LINK = "https://www.example-meetings.com/join/very-long-meeting-room-name-that-keeps-going/" + "x".repeat(120);
const ev = (id, title, over = {}) => ({ id, title, event_date: TODAY, date: TODAY, all_day: false, start_time: "19:30:00", end_time: "23:00:00", repeat: "none", repeat_until: null, category_id: null, note: "", link: "", created_at: "2026-10-01T00:00:00Z", ...over });
const items = [
  ev("e1", "Grameenphone CV training", { repeat: "weekly", repeat_until: "2026-11-15", note: NOTE, link: LONG_LINK }),
  ev("e2", "Plain event", { start_time: "08:00:00", end_time: "09:00:00" }),
  ev("e3", "Old cached event without the link field", { start_time: "12:00:00", end_time: "13:00:00", link: undefined }),
];

const browser = await launch();
for (const width of [390, 320, 1280]) {
  const wide = width >= 1000;
  const ctx = wide ? await browser.newContext({ viewport: { width, height: 900 } }) : await newPhone(browser, width);
  if (wide) await ctx.addCookies([{ name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), url: BASE }]);
  const sent = [];
  await apiMock(ctx, { "/events": (method) => (method === "GET" ? { today: TODAY, from: "2026-09-28", to: "2026-11-08", items } : { id: "e1" }) });
  await ctx.route(/\/api\/events(\/[^/]+)?$/, (route) => {
    const req = route.request();
    if (req.method() === "GET") return route.fallback();
    sent.push({ method: req.method(), body: req.postDataJSON() });
    return route.fulfill({ status: req.method() === "POST" ? 201 : 200, json: { id: "e1" } });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/calendar`);
  await page.getByRole("heading", { name: "Calendar", level: 1 }).waitFor({ timeout: 30000 });
  const agenda = page.locator("ol", { has: page.getByText("Plain event") });
  await agenda.getByText("Grameenphone CV training").waitFor();

  // ---- the agenda: the link is an icon next to the event; the row itself still opens the editor
  const open = agenda.getByRole("link", { name: "Open the link of Grameenphone CV training" });
  check(`${width}px: an event with a link has a link icon that opens it in a new tab`, (await open.count()) === 1 && (await open.getAttribute("href")) === LONG_LINK && (await open.getAttribute("target")) === "_blank" && (await open.getAttribute("rel")).includes("noopener"));
  check(`${width}px: events without a link (or from an older saved list) have no icon`, (await agenda.getByRole("link").count()) === 1);
  const row = await agenda.getByRole("button", { name: /Grameenphone CV training/ }).boundingBox();
  const icon = await open.boundingBox();
  check(`${width}px: the icon sits inside the row, at its right edge`, icon.x >= row.x && icon.x + icon.width <= row.x + row.width + 1 && icon.y >= row.y - 1 && icon.y + icon.height <= row.y + row.height + 12, JSON.stringify({ row, icon }));
  if (SHOTS && width === 390) await page.screenshot({ path: `${SHOTS}/event-link-agenda-390.png` });

  // ---- the form
  await agenda.getByRole("button", { name: /Grameenphone CV training/ }).click();
  const form = page.getByRole("dialog", { name: "Edit event" });
  await form.getByLabel("Title").waitFor();
  const note = form.getByLabel("Place or note");
  const linkBox = form.getByLabel("Event Link (optional)");
  check(`${width}px: "Place or note" is a text area that shows all its lines`, (await note.evaluate((el) => el.tagName)) === "TEXTAREA" && (await note.inputValue()) === NOTE);
  const [t, n, l, c] = await Promise.all([form.getByLabel("Title").boundingBox(), note.boundingBox(), linkBox.boundingBox(), form.getByLabel("Category").boundingBox()]);
  check(`${width}px: the note box is as wide as the title (full width)`, Math.abs(n.width - t.width) <= 1 && Math.abs(n.x - t.x) <= 1, JSON.stringify({ title: t.width, note: n.width }));
  check(`${width}px: the Event Link box and the Category box are full width too`, Math.abs(l.width - t.width) <= 1 && Math.abs(c.width - t.width) <= 1);
  check(`${width}px: the note is tall enough for several lines (about 4)`, n.height >= 90, String(n.height));
  check(`${width}px: the Event Link box shows the saved link and is optional`, (await linkBox.inputValue()) === LONG_LINK && !(await linkBox.evaluate((el) => el.required)));
  check(`${width}px: the order is Category, Event Link, then Place or note`, c.y < l.y && l.y < n.y);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/event-link-form-${width}.png` });
  const m = await measure(page, width);
  check(`${width}px: the form does not widen the page`, !m.zoomedOut && m.mainClipped === 0 && m.offenders.length === 0, JSON.stringify(m));

  // ---- a link without https:// is fixed; a broken one is refused (nothing is sent)
  await linkBox.fill("meet.google.com/abc-defg-hij");
  await note.fill(NOTE + "\nSecond note line");
  await form.getByRole("button", { name: "Save event" }).click();
  await page.getByText("Event saved").first().waitFor();
  const saved = sent.at(-1);
  check(`${width}px: saving sends the link with https:// added, and the note with its line breaks`, saved.method === "PATCH" && saved.body.link === "https://meet.google.com/abc-defg-hij" && saved.body.note === NOTE + "\nSecond note line", JSON.stringify(saved.body));

  sent.length = 0;
  await agenda.getByRole("button", { name: /Grameenphone CV training/ }).click();
  await form.getByLabel("Event Link (optional)").fill("not a link at all");
  await form.getByRole("button", { name: "Save event" }).click();
  await page.getByText("The event link should start with https://").first().waitFor();
  check(`${width}px: a link that is not a web address is refused with a message and nothing is sent`, sent.length === 0 && (await form.isVisible()));

  // ---- the link can be removed
  await form.getByLabel("Event Link (optional)").fill("");
  await form.getByRole("button", { name: "Save event" }).click();
  await page.waitForFunction(() => document.querySelectorAll("dialog[open]").length === 0);
  check(`${width}px: clearing the box removes the link (an empty link is sent)`, sent.at(-1)?.body.link === "");

  // ---- an event saved before links existed opens without trouble, and a new event can have a link
  await agenda.getByRole("button", { name: /Old cached event/ }).click();
  check(`${width}px: an event from an older saved list opens with an empty link box`, (await form.getByLabel("Event Link (optional)").inputValue()) === "");
  await form.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: /Add an event on this day/ }).first().click();
  const fresh = page.getByRole("dialog", { name: "New event" });
  await fresh.getByLabel("Title").fill("Webinar");
  await fresh.getByLabel("Event Link (optional)").fill("zoom.us/j/123456");
  await fresh.getByLabel("Place or note").fill("Bring questions");
  sent.length = 0;
  await fresh.getByRole("button", { name: "Add event" }).click();
  await page.getByText("Event added").first().waitFor();
  check(`${width}px: a new event is created with its link and note`, sent.at(-1)?.method === "POST" && sent.at(-1).body.link === "https://zoom.us/j/123456" && sent.at(-1).body.note === "Bring questions", JSON.stringify(sent.at(-1)));

  const end = await measure(page, width);
  check(`${width}px: no sideways scrolling on the Calendar page`, !end.zoomedOut && end.mainClipped === 0 && end.offenders.length === 0, JSON.stringify(end));
  check(`${width}px: no page errors`, errors.length === 0, errors.join(" | "));
  await ctx.close();
}

await browser.close();
console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
