// Browser check for the Dashboard's short "Projects" box: where it sits (right after Tasks), what it lists and how it looks at phone widths.
// The built app must be running on http://localhost:3123.   Run:  node dashboard-projects-e2e.mjs   (a stand-in API answers; SHOTS=<folder> saves pictures)
import { launch, newPhone, apiMock, measure, BASE, TODAY, session } from "/home/user/Personal-OS/dev-tools/browser-checks/audit-lib.mjs";

let failures = 0;
const check = (name, ok, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  → " + extra : ""}`);
};

const LONG = "Unbroken" + "Segment".repeat(14);
const timeframe = (kind, label, days, tone) => ({ kind, label, days, tone });
const project = (id, name, over = {}) => ({ id, name, kind: "website", status: "active", color: "blue", client: "", goal: "", start_date: null, due_date: null, archived_at: null, created_at: "2026-10-01T00:00:00Z", links: [], timeframe: timeframe("ongoing", "Ongoing · running 11 days", null, "none"), tasks_total: 0, tasks_done: 0, tasks_open: 0, percent: 0, ...over });
const projects = {
  today: TODAY,
  items: [
    project("p1", "Bakery website", { color: "teal", due_date: "2026-10-20", timeframe: timeframe("dated", "Due in 14 days", 14, "ok"), tasks_total: 8, tasks_done: 6, tasks_open: 2, percent: 75 }),
    project("p2", "Late project", { color: "rose", due_date: "2026-10-03", timeframe: timeframe("dated", "Overdue by 3 days", -3, "late"), tasks_total: 4, tasks_done: 1, tasks_open: 3, percent: 25 }),
    project("p3", "Personal brand", { color: "violet", tasks_total: 0 }),
    project("p4", LONG, { color: "amber", due_date: "2026-10-08", timeframe: timeframe("dated", "Due in 2 days", 2, "soon"), tasks_total: 10, tasks_done: 5, tasks_open: 5, percent: 50 }),
    project("p5", "Fifth one", { due_date: "2026-12-01", timeframe: timeframe("dated", "Due in 56 days", 56, "ok"), tasks_total: 2, tasks_done: 0, tasks_open: 2, percent: 0 }),
    project("p6", "Sixth one", { due_date: "2026-12-05", timeframe: timeframe("dated", "Due in 60 days", 60, "ok"), tasks_total: 2, tasks_done: 0, tasks_open: 2, percent: 0 }),
    project("p7", "Paused one", { status: "paused", timeframe: timeframe("ongoing", "Ongoing · running 30 days", null, "none") }),
    project("p8", "Finished one", { status: "done", timeframe: timeframe("ended", "Done", null, "none"), tasks_total: 3, tasks_done: 3, percent: 100 }),
  ],
};
const task = (id, title) => ({ id, title, notes: "", due_date: TODAY, end_date: null, done_at: null, category_id: null, project_id: null, priority: "medium", created_at: "2026-10-01T00:00:00Z" });
const dashboard = {
  today: TODAY, name: "Nurullah",
  stats: { tasks: { done: 1, total: 2 }, goals: { on_track: 0, active: 0 }, streak: { days: 0, name: "" }, wellness: null },
  schedule: [], tasks: { today: [task("t1", "A task for today")], week: [], overdue: [] },
  habits: { days: [], items: [], done_today: 0 }, goals: [],
  budget: { month: TODAY.slice(0, 7), total: 0, spent: 0, categories: [] },
  health: { steps: null, sleep_minutes: null, resting_hr: null, goals: { steps: 10000, sleep_minutes: 480 } },
  reminders: [], productivity: { days: [], this_week: 0, last_week: 0, change: null },
};

const learningWeek = { today: TODAY, week_start: "2026-10-05", topic: "", goal_hours: 5, blocks: [], courses: [], study_next: [], open_topics: [], library: [], stats: { streak: 0, weeks: [] } };
const shared = (items) => ({ "/dashboard": dashboard, "/projects": items, "/learning/week": learningWeek });
const browser = await launch();

for (const width of [390, 320, 1280]) {
  const wide = width >= 1000;
  const ctx = wide ? await browser.newContext({ viewport: { width, height: 900 } }) : await newPhone(browser, width);
  if (wide) await ctx.addCookies([{ name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), url: BASE }]);
  await apiMock(ctx, shared(projects));
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`);
  const box = page.locator("section", { has: page.getByRole("heading", { name: "Projects", exact: true }) });
  await box.waitFor();
  await box.locator("ul li").first().waitFor();

  // ---- where it sits: right after Tasks, before Learning
  const headings = await page.locator("main section h2").allInnerTexts();
  const order = headings.map((t) => t.trim());
  check(`${width}px: the Projects box comes right after the Tasks box (and before Learning)`, order.indexOf("Tasks") >= 0 && order.indexOf("Projects") === order.indexOf("Tasks") + 1 && order.indexOf("Learning") === order.indexOf("Projects") + 1, JSON.stringify(order.slice(0, 5)));

  // ---- what it lists: active projects only, the nearest due date first, ongoing ones after them, four at most
  const names = (await box.locator("ul li a > div > p > span.truncate").allInnerTexts()).map((t) => t.trim().replace(LONG, "LONG"));
  check(`${width}px: it lists the active projects, nearest due date first (overdue first), ongoing last, four at most`, JSON.stringify(names) === JSON.stringify(["Late project", "LONG", "Bakery website", "Fifth one"]), JSON.stringify(names));
  check(`${width}px: paused and finished projects are not listed`, (await box.getByText("Paused one").count()) === 0 && (await box.getByText("Finished one").count()) === 0);
  const bakery = box.locator("li", { hasText: "Bakery website" });
  check(`${width}px: each project shows its progress in per cent and in tasks`, (await bakery.getByText("75%").count()) === 1 && (await bakery.getByText("6 of 8 tasks done").count()) === 1 && (await bakery.getByRole("progressbar").getAttribute("aria-valuenow")) === "75");
  check(`${width}px: and when it is due, a late one in red and a soon one in amber`, (await bakery.getByText("Due in 14 days").count()) === 1 && /text-rose-600/.test((await box.locator("li", { hasText: "Late project" }).getByText("Overdue by 3 days").getAttribute("class")) ?? "") && /text-amber-600/.test((await box.locator("li", { hasText: LONG }).getByText("Due in 2 days").getAttribute("class")) ?? ""));
  check(`${width}px: a project opens when tapped`, (await bakery.locator("a").getAttribute("href")) === "/projects/p1");
  check(`${width}px: the footer says how many are active, paused and done, and that 2 more are not listed`, (await box.getByText(/6 active · 1 paused · 1 done/).count()) === 1 && (await box.getByRole("link", { name: "+2 more" }).getAttribute("href")) === "/projects");
  check(`${width}px: "View All" goes to Projects`, (await box.getByRole("link", { name: /View All/ }).getAttribute("href")) === "/projects");
  let m = await measure(page, width);
  check(`${width}px: the dashboard does not overflow (a 100-letter project name)`, !m.zoomedOut && m.mainClipped === 0 && m.offenders.length === 0, JSON.stringify(m));
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/dashboard-projects-${width}.png`, fullPage: true });
  await ctx.close();
}

// ---- a project with no tasks, and the empty states
{
  const ctx = await newPhone(browser, 390);
  await apiMock(ctx, shared({ today: TODAY, items: [project("p3", "Personal brand")] }));
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`);
  const box = page.locator("section", { has: page.getByRole("heading", { name: "Projects", exact: true }) });
  await box.locator("ul li").first().waitFor();
  check("a project without tasks says so (no 0%) and asks for tasks; an ongoing project says Ongoing", (await box.getByText("No tasks", { exact: true }).count()) === 1 && (await box.getByText("Add tasks to see progress").count()) === 1 && (await box.getByText("Ongoing", { exact: true }).count()) === 1 && (await box.getByText("0%").count()) === 0);
  await ctx.close();
}
{
  const ctx = await newPhone(browser, 390);
  await apiMock(ctx, shared({ today: TODAY, items: [] }));
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`);
  const box = page.locator("section", { has: page.getByRole("heading", { name: "Projects", exact: true }) });
  await box.getByText("No projects yet.").waitFor();
  check("with no projects the box says so and links to Add a project", (await box.getByRole("link", { name: "Add a project" }).getAttribute("href")) === "/projects");
  await ctx.close();
}
{
  const ctx = await newPhone(browser, 390);
  await apiMock(ctx, shared({ today: TODAY, items: [project("p7", "Paused one", { status: "paused" })] }));
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`);
  const box = page.locator("section", { has: page.getByRole("heading", { name: "Projects", exact: true }) });
  await box.getByText("No active projects.").waitFor();
  check("with only paused projects it says there are no active ones and links to Projects", (await box.getByRole("link", { name: "Open Projects" }).getAttribute("href")) === "/projects");
  await ctx.close();
}

await browser.close();
console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
