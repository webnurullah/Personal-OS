// Browser check: the events added in the Calendar are listed in the Tasks page (today's events, and each upcoming event once on its next day),
// follow the search, the category choice and the filter tabs, open that day in the Calendar, and show the event link.
// The app must be running on http://localhost:3123.   Run:  node tasks-events-e2e.mjs   (a stand-in API answers; SHOTS=<folder> saves pictures)
import { launch, newPhone, apiMock, measure, BASE, TODAY, session } from "/home/user/Personal-OS/dev-tools/browser-checks/audit-lib.mjs";

let failures = 0;
const check = (name, ok, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  → " + extra : ""}`);
};
const SHOTS = process.env.SHOTS;

const day = (n) => { const d = new Date(`${TODAY}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const LONG = "An-event-with-a-very-long-title-and-no-spaces-" + "x".repeat(120);
const task = (id, title, over = {}) => ({ id, title, notes: "", due_date: null, end_date: null, done_at: null, category_id: null, project_id: null, priority: "medium", created_at: "2026-10-01T00:00:00Z", ...over });
const tasks = [task("t1", "Pay the electricity bill", { due_date: TODAY }), task("t2", "Buy a gift", { due_date: day(3) }), task("t3", "Plan the year")];
const ev = (id, title, date, over = {}) => ({ id, title, event_date: date, date, all_day: false, start_time: "19:30:00", end_time: "23:00:00", repeat: "none", repeat_until: null, category_id: null, note: "", link: "", created_at: "2026-10-01T00:00:00Z", ...over });
// What the API gives: one entry per day an event happens.
const events = [
  ev("e1", "Grameenphone CV training", TODAY, { repeat: "weekly", repeat_until: day(14), link: "https://meet.google.com/abc-defg-hij", note: "Bring a laptop" }),
  ev("e1", "Grameenphone CV training", day(7), { repeat: "weekly", repeat_until: day(14), link: "https://meet.google.com/abc-defg-hij", note: "Bring a laptop" }),
  ev("e1", "Grameenphone CV training", day(14), { repeat: "weekly", repeat_until: day(14), link: "https://meet.google.com/abc-defg-hij", note: "Bring a laptop" }),
  ev("e2", "Morning walk", TODAY, { all_day: true, start_time: null, end_time: null }),
  ev("e3", "Daily stand-up", day(1), { repeat: "daily", start_time: "09:00:00", end_time: "09:15:00" }),
  ev("e3", "Daily stand-up", day(2), { repeat: "daily", start_time: "09:00:00", end_time: "09:15:00" }),
  ev("e3", "Daily stand-up", day(3), { repeat: "daily", start_time: "09:00:00", end_time: "09:15:00" }),
  ev("e4", LONG, day(3), { all_day: true, start_time: null, end_time: null }),
];

const browser = await launch();
for (const width of [390, 320, 1280]) {
  const wide = width >= 1000;
  const ctx = wide ? await browser.newContext({ viewport: { width, height: 900 } }) : await newPhone(browser, width);
  if (wide) await ctx.addCookies([{ name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), url: BASE }]);
  const asked = [];
  await apiMock(ctx, {
    "/tasks": { today: TODAY, items: tasks },
    "/events": (method, url) => {
      asked.push(url.search);
      return { today: TODAY, from: TODAY, to: day(60), items: events };
    },
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/tasks`);
  const list = page.locator("section[aria-label='Task list']");
  await list.getByText("Pay the electricity bill").waitFor({ timeout: 30000 });
  await list.getByText("Grameenphone CV training").first().waitFor();

  const heading = (name) => list.locator("h3", { hasText: name });
  const groupOf = (name) => heading(name).locator("xpath=..");

  // ---- what is asked: only your own events, from today for 60 days
  check(`${width}px: the list asks for your own events from today for 60 days (nothing else from the Calendar)`, asked.some((s) => s === `?from=${TODAY}&to=${day(60)}&own=1`), JSON.stringify(asked));

  // ---- where they appear
  const todayTitles = (await groupOf("Today").locator("li").allInnerTexts()).map((t) => t.split("\n")[0]);
  check(`${width}px: Today lists today's events after the tasks (all-day first, then by time)`, todayTitles.join("|") === "Pay the electricity bill|Morning walk|Grameenphone CV training", JSON.stringify(todayTitles));
  const upcoming = (await groupOf("Upcoming").locator("li").allInnerTexts()).map((t) => t.split("\n")[0]);
  check(`${width}px: Upcoming mixes tasks and events by day, each event once on its next day (the daily one tomorrow, the weekly one next week)`, upcoming.join("|") === ["Daily stand-up", "Buy a gift", LONG, "Grameenphone CV training"].join("|"), JSON.stringify(upcoming));
  check(`${width}px: the Upcoming count is 4`, (await heading("Upcoming").innerText()).includes("4") && (await groupOf("Upcoming").getByText("Daily stand-up").count()) === 1);
  check(`${width}px: tasks with no date stay under No date; events never are`, (await groupOf("No date").getByText("Plan the year").count()) === 1 && (await groupOf("No date").getByText("Event").count()) === 0);

  // ---- the row
  const cv = groupOf("Today").locator("li", { hasText: "Grameenphone CV training" });
  const text = await cv.innerText();
  check(`${width}px: an event row says Event, the time range and that it repeats, and has no tick box`, text.includes("Event") && text.includes("7:30 PM – 11:00 PM") && text.includes("Every week") && (await cv.locator("input[type=checkbox]").count()) === 0, text.replace(/\n/g, " | "));
  check(`${width}px: an all-day event says All day`, (await groupOf("Today").locator("li", { hasText: "Morning walk" }).innerText()).includes("All day"));
  const link = cv.getByRole("link", { name: "Open the link of Grameenphone CV training" });
  check(`${width}px: the event's link opens in a new tab`, (await link.getAttribute("href")) === "https://meet.google.com/abc-defg-hij" && (await link.getAttribute("target")) === "_blank");
  check(`${width}px: an event row has no delete button`, (await cv.getByRole("button").count()) === 0);
  check(`${width}px: the row opens that day in the Calendar`, (await cv.getByRole("link", { name: /Open in the Calendar/ }).getAttribute("href")) === `/calendar?date=${TODAY}`);
  const m = await measure(page, width);
  check(`${width}px: long event titles do not widen the page`, !m.zoomedOut && m.mainClipped === 0 && m.offenders.length === 0, JSON.stringify(m));
  if (SHOTS && width !== 320) await page.screenshot({ path: `${SHOTS}/tasks-events-${width}.png`, fullPage: true });

  // ---- tabs, search, category
  await list.getByRole("tab", { name: "Today", exact: true }).click();
  check(`${width}px: the Today tab shows today's tasks and events only`, (await list.locator("h3").allInnerTexts()).map((t) => t.split(/\s/)[0]).join() === "TODAY" && (await list.getByText("Morning walk").count()) === 1 && (await list.getByText("Daily stand-up").count()) === 0);
  await list.getByRole("tab", { name: "Upcoming", exact: true }).click();
  check(`${width}px: the Upcoming tab shows the upcoming events`, (await list.getByText("Daily stand-up").count()) === 1 && (await list.getByText("Morning walk").count()) === 0);
  await list.getByRole("tab", { name: "Overdue", exact: true }).click();
  check(`${width}px: the Overdue and Completed tabs have no events`, (await list.getByText(/Event$/).count()) === 0 && (await list.getByText("Daily stand-up").count()) === 0);
  await list.getByRole("tab", { name: "All", exact: true }).click();
  await list.getByPlaceholder("Search tasks").fill("stand-up");
  check(`${width}px: the search finds events too (and hides the rest)`, (await list.getByText("Daily stand-up").count()) === 1 && (await list.getByText("Pay the electricity bill").count()) === 0 && (await list.getByText("Morning walk").count()) === 0);
  await list.getByPlaceholder("Search tasks").fill("laptop");
  check(`${width}px: the search also looks in the event's note`, (await list.getByText("Grameenphone CV training").count()) >= 1 && (await list.getByText("Daily stand-up").count()) === 0);
  await list.getByPlaceholder("Search tasks").fill("");

  // ---- the empty message counts events
  await list.getByPlaceholder("Search tasks").fill("zzzz-nothing");
  check(`${width}px: a search with no match says so`, (await list.getByText("No tasks here").count()) === 1);
  await list.getByPlaceholder("Search tasks").fill("");

  check(`${width}px: no page errors`, errors.length === 0, errors.join(" | "));
  await ctx.close();
}

// ---- a failed events request just means no events (the tasks still show)
{
  const ctx = await newPhone(browser, 390);
  await apiMock(ctx, { "/tasks": { today: TODAY, items: tasks } });
  await ctx.route("**/api/events?*", (route) => route.fulfill({ status: 500, json: { error: { message: "no" } } }));
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/tasks`);
  const list = page.locator("section[aria-label='Task list']");
  await list.getByText("Pay the electricity bill").waitFor({ timeout: 30000 });
  await page.waitForTimeout(800);
  check("if the events cannot be loaded the tasks still show, without events and without an error message", (await list.getByText("Buy a gift").count()) === 1 && (await list.getByText("Event", { exact: true }).count()) === 0 && (await page.getByText("could not load").count()) === 0 && errors.length === 0, errors.join(" | "));
  await ctx.close();
}

await browser.close();
console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
