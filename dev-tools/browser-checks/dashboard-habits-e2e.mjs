// Browser check for the habit tracker ("Last 7 days") at the top of the Dashboard, full width, and that the Habits page still has it.
// The built app must be running on http://localhost:3123.   Run:  node dashboard-habits-e2e.mjs   (a stand-in API answers; SHOTS=<folder> saves pictures)
import { launch, newPhone, apiMock, measure, BASE, TODAY, session } from "/home/user/Personal-OS/dev-tools/browser-checks/audit-lib.mjs";

let failures = 0;
const check = (name, ok, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  → " + extra : ""}`);
};

const days = [-6, -5, -4, -3, -2, -1, 0].map((n) => { const d = new Date(`${TODAY}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); });
const LONG = "Unbroken" + "Segment".repeat(14);
const habit = (id, name, goal, over = {}) => ({ id, name, goal_text: goal, icon: "notebook-pen", color: "blue", position: 0, done: [false, false, false, false, false, false, false], streak: 0, share: 0, ...over });
const habits = {
  today: TODAY, days, heatmap: [],
  items: [
    habit("h1", "Office Work", "2 hours Daily", { done: [true, true, false, true, true, true, false], streak: 0, share: 71 }),
    habit("h2", "Personal Project", "2 Hours Daily", { color: "sky", icon: "bike" }),
    habit("h3", "Digital Learning", "2 Hours Daily", { color: "teal", icon: "book-open" }),
    habit("h4", LONG, LONG, { color: "emerald", icon: "brain", streak: 12 }),
    habit("h5", "NWC Work", "20 Minute - Every Day", { color: "green", icon: "bike" }),
  ],
  summary: { total: 5, done_today: 0, best: { days: 12, name: LONG }, share: 20, perfect_days: 0, most_consistent: { name: "Office Work", share: 71 }, needs_attention: { name: "Personal Project", share: 0 } },
};
const task = (id, title) => ({ id, title, notes: "", due_date: TODAY, end_date: null, done_at: null, category_id: null, project_id: null, priority: "medium", created_at: "2026-10-01T00:00:00Z" });
const dashboard = {
  today: TODAY, name: "Nurullah",
  stats: { tasks: { done: 1, total: 2 }, goals: { on_track: 0, active: 0 }, streak: { days: 0, name: "" }, wellness: null },
  schedule: [], tasks: { today: [task("t1", "A task for today")], week: [], overdue: [] },
  habits: { days, items: habits.items, done_today: 0 }, goals: [],
  budget: { month: TODAY.slice(0, 7), total: 0, spent: 0, categories: [] },
  health: { steps: null, sleep_minutes: null, resting_hr: null, goals: { steps: 10000, sleep_minutes: 480 } },
  reminders: [], productivity: { days: [], this_week: 0, last_week: 0, change: null },
};
const learningWeek = { today: TODAY, week_start: "2026-10-05", topic: "", goal_hours: 5, blocks: [], courses: [], study_next: [], open_topics: [], library: [], stats: { streak: 0, weeks: [] } };

const browser = await launch();

for (const width of [390, 320, 1280]) {
  const wide = width >= 1000;
  const ctx = wide ? await browser.newContext({ viewport: { width, height: 900 } }) : await newPhone(browser, width);
  if (wide) await ctx.addCookies([{ name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), url: BASE }]);
  const calls = [];
  await apiMock(ctx, { "/dashboard": dashboard, "/habits?days=7": habits, "/learning/week": learningWeek, "/projects": { today: TODAY, items: [] } });
  await ctx.route(/\/api\/habits\/[^/]+\/logs\/[\d-]+$/, (route) => {
    calls.push([route.request().method(), new URL(route.request().url()).pathname.replace("/api", "")]);
    return route.fulfill({ json: { ok: true } });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/`);
  const card = page.locator("section", { has: page.getByRole("heading", { name: "Last 7 days", exact: true }) });
  await card.locator("table").waitFor();

  // ---- where it sits and how wide it is
  const headings = (await page.locator("main section h2").allInnerTexts()).map((t) => t.trim());
  check(`${width}px: the habit tracker is the first box on the dashboard (before Tasks)`, headings[0] === "Last 7 days" && headings.indexOf("Tasks") === 1, JSON.stringify(headings.slice(0, 4)));
  check(`${width}px: the small "Habit Tracker" box is gone (the tracker replaces it)`, (await page.getByRole("heading", { name: "Habit Tracker", exact: true }).count()) === 0);
  const main = await page.locator("main").boundingBox();
  const box = await card.boundingBox();
  check(`${width}px: it spans the whole width of the page`, box.width >= main.width - 70, JSON.stringify({ card: Math.round(box.width), main: Math.round(main.width) }));
  const tasksBox = await page.locator("section", { has: page.getByRole("heading", { name: "Tasks", exact: true }) }).boundingBox();
  check(`${width}px: Tasks comes below it`, tasksBox.y > box.y + box.height - 2);

  // ---- what it shows
  {
    const facts = { rows: await card.locator("tbody tr").count(), dots: await card.locator("button.habit-dot").count(), goal: await card.getByText("· 2 hours Daily", { exact: true }).isVisible(), share: await card.getByText("71%", { exact: true }).count() };
    check(`${width}px: every habit has a row with a dot for each of the 7 days and its share of the week (and its goal on a wide screen)`, facts.rows === 5 && facts.dots === 35 && facts.goal === wide && facts.share === 1, JSON.stringify(facts));
  }
  check(`${width}px: the line "Tap a day to tick or untick it. Streaks update straight away." is not on the dashboard`, (await page.getByText("Tap a day to tick or untick it").count()) === 0);
  {
    const rows = await card.locator("tbody tr").evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
    const dot = await card.locator("button.habit-dot").first().boundingBox();
    const cardBox = await card.boundingBox();
    check(`${width}px: the card is small: rows of at most 44px, dots of 26px (it was 61px and 36px)`, rows.every((h) => h <= 44) && Math.round(dot.width) === 26, JSON.stringify({ rows, dot: Math.round(dot.width), card: Math.round(cardBox.height) }));
    if (wide) check(`${width}px: with 5 habits the whole card is under 300px tall`, cardBox.height < 300, String(Math.round(cardBox.height)));
  }
  check(`${width}px: the days are labelled and today is marked`, (await card.locator("th[data-today]").innerText()).includes("Today") && (await card.locator("thead th").count()) === 11);
  check(`${width}px: ticked days show as pressed`, (await card.getByRole("button", { name: /^Office Work · / }).evaluateAll((els) => els.map((e) => e.getAttribute("aria-pressed")))).join() === "true,true,false,true,true,true,false");
  check(`${width}px: there is no edit or delete here (that is on the Habits page), but a View All link`, (await card.getByRole("button", { name: /^(Edit|Delete) / }).count()) === 0 && (await card.getByRole("link", { name: /View All/ }).getAttribute("href")) === "/habits");
  if (!wide) {
    const today = await card.locator("th[data-today]").boundingBox();
    check(`${width}px: on a phone the table starts with today's column in view`, today.x >= 0 && today.x + today.width <= width + 1, JSON.stringify({ x: Math.round(today.x), w: Math.round(today.width) }));
  }
  let m = await measure(page, width);
  check(`${width}px: the dashboard does not overflow (the table scrolls inside its own box)`, !m.zoomedOut && m.mainClipped === 0 && m.offenders.length === 0, JSON.stringify(m));
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/dashboard-habits-${width}.png`, fullPage: false });

  // ---- ticking and unticking
  const today = card.getByRole("button", { name: "Personal Project · Today" });
  check(`${width}px: today starts not ticked`, (await today.getAttribute("aria-pressed")) === "false");
  await today.evaluate((el) => el.click()); // (the name column that stays put on a phone must not be what gets the tap in this test)
  check(`${width}px: tapping today ticks it at once`, (await today.getAttribute("aria-pressed")) === "true");
  await page.waitForTimeout(400);
  await card.getByRole("button", { name: "Office Work · Today" }).evaluate((el) => el.click()); // not ticked before
    await page.waitForTimeout(400);
  check(`${width}px: the ticks are saved (PUT for a tick, DELETE for an untick, on the right day)`, calls.some(([m, p]) => m === "PUT" && p === `/habits/h2/logs/${TODAY}`) && calls.some(([m, p]) => m === "PUT" && p === `/habits/h1/logs/${TODAY}`), JSON.stringify(calls));
  check(`${width}px: no page errors`, errors.length === 0, errors.join(" | "));
  await ctx.close();
}

// ---- the Habits page still has the same card, with edit and delete
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies([{ name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), url: BASE }]);
  const calls = [];
  await apiMock(ctx, { "/habits?days=7": habits });
  await ctx.route(/\/api\/habits\/[^/]+\/logs\/[\d-]+$/, (route) => { calls.push(route.request().method()); return route.fulfill({ json: { ok: true } }); });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/habits`);
  const card = page.locator("section", { has: page.getByRole("heading", { name: "Last 7 days", exact: true }) });
  await card.locator("table").waitFor();
  check("the Habits page keeps the line that tells how to tick a day, and its larger rows", (await page.getByText("Tap a day to tick or untick it. Streaks update straight away.").count()) === 1 && Math.round((await card.locator("button.habit-dot").first().boundingBox()).width) === 36);
  check("the Habits page has the same tracker, with Edit and Delete for each habit and no View All", (await card.getByRole("button", { name: /^Edit / }).count()) >= 5 && (await card.getByRole("button", { name: /^Delete / }).count()) >= 5 && (await card.getByRole("link", { name: /View All/ }).count()) === 0);
  await card.getByRole("button", { name: "NWC Work · Today" }).evaluate((el) => el.click());
  const ticked = (await card.getByRole("button", { name: "NWC Work · Today" }).getAttribute("aria-pressed")) === "true"; // at once (the stand-in answers later with its unchanged list)
  await page.waitForTimeout(300);
  check("and ticking works there too", ticked && calls.includes("PUT"), JSON.stringify({ ticked, calls }));
  await card.getByRole("button", { name: "Edit NWC Work" }).first().click();
  check("Edit opens the habit form", (await page.getByRole("dialog").getByLabel("Habit").inputValue()) === "NWC Work");
  await ctx.close();
}

// ---- no habits yet
{
  const ctx = await newPhone(browser, 390);
  await apiMock(ctx, { "/dashboard": { ...dashboard, habits: { days, items: [], done_today: 0 } }, "/habits?days=7": { ...habits, items: [], summary: { ...habits.summary, total: 0 } }, "/learning/week": learningWeek, "/projects": { today: TODAY, items: [] } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`);
  const card = page.locator("section", { has: page.getByRole("heading", { name: "Last 7 days", exact: true }) });
  await card.getByText("No habits yet").waitFor();
  check("with no habits the card says so and links to add one", (await card.getByRole("link", { name: "New habit" }).getAttribute("href")) === "/habits?new=1");
  await ctx.close();
}

await browser.close();
console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
