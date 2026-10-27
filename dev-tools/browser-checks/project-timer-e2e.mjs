// Browser check for the project timer (project page) and "Project time" on the Habits page, with a stand-in API that keeps real state
// (the same rules as the server: one timer at a time, time carries on, paused timers keep their time).
// The built app must be running on http://localhost:3123.   Run:  node project-timer-e2e.mjs   (SHOTS=<folder> saves pictures)
import { launch, newPhone, apiMock, measure, BASE, TODAY, session } from "/home/user/Personal-OS/dev-tools/browser-checks/audit-lib.mjs";
import { endFor, projectState, summariseTime } from "/home/user/Personal-OS/web/lib/project-time.ts";

let failures = 0;
const check = (name, ok, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  → " + extra : ""}`);
};

const projects = [
  { id: "p1", name: "CRM", kind: "website", status: "active", color: "amber", client: "NWC", goal: "Make Fully CRM, Get 5 Lakh", start_date: "2026-10-01", due_date: "2026-12-31", archived_at: null, created_at: "2026-10-01T00:00:00Z", created_on: "2026-10-01", archived_on: null, links: [], notes: "", timeframe: { kind: "dated", label: "Due in 74 days", days: 74, tone: "ok" }, tasks_total: 8, tasks_done: 3, tasks_open: 5, percent: 38 },
  { id: "p2", name: "A very long project name that must be cut short on a phone screen " + "x".repeat(60), kind: "other", status: "active", color: "blue", client: "", goal: "", start_date: null, due_date: null, archived_at: null, created_at: "2026-10-01T00:00:00Z", created_on: "2026-10-01", archived_on: null, links: [], notes: "", timeframe: { kind: "ongoing", label: "Ongoing", days: null, tone: "ok" }, tasks_total: 0, tasks_done: 0, tasks_open: 0, percent: 0 },
];
const habitsEmpty = { today: TODAY, days: ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06"], items: [], heatmap: [], summary: { total: 0, done_today: 0, best: { days: 0, name: "" }, share: 0, perfect_days: 0, most_consistent: null, needs_attention: null } };
// Sessions are made from the real clock, so the days are the real ones (the UTC date).
const REAL = new Date().toISOString().slice(0, 10);
const hoursAgo = (h) => new Date(Date.now() - h * 3600000).toISOString();
const browser = await launch();

for (const width of [390, 320, 1280]) {
  const wide = width >= 1000;
  const ctx = wide ? await browser.newContext({ viewport: { width, height: 900 } }) : await newPhone(browser, width);
  if (wide) await ctx.addCookies([{ name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), url: BASE }]);
  // Finished sessions: CRM 1h30 earlier today ... (started a few hours ago), 30 minutes yesterday.
  const rows = [
    { project_id: "p1", started_at: hoursAgo(5), ended_at: new Date(Date.now() - 5 * 3600000 + 90 * 60000).toISOString() },
    { project_id: "p1", started_at: hoursAgo(30), ended_at: new Date(Date.now() - 30 * 3600000 + 30 * 60000).toISOString() },
  ];
  const posts = [];
  const nameOf = (id) => projects.find((p) => p.id === id)?.name ?? "";
  const stateFor = (id) => {
    // Several timers can run at once: this project's state only knows its own running timer.
    const run = rows.find((r) => !r.ended_at && r.project_id === id);
    return projectState(rows.filter((r) => r.project_id === id), id, run ? nameOf(run.project_id) : "", REAL, "UTC", Date.now(), "project");
  };
  const timeRoute = (id) => (method, url) => {
    if (method === "POST") {
      const action = JSON.parse(url.postData ?? "{}").action;
      posts.push(`${id}:${action}`);
      const run = rows.find((r) => !r.ended_at && r.project_id === id);
      if (action === "start") {
        if (!run) rows.push({ project_id: id, started_at: new Date().toISOString(), ended_at: null });
      } else if (run) run.ended_at = endFor(run.started_at, Date.now());
    }
    return stateFor(id);
  };
  const detail = (p) => ({ today: TODAY, project: p, tasks: [] });
  await apiMock(ctx, {
    "/habits?days=7": habitsEmpty,
    "/projects/p1": detail(projects[0]),
    "/projects/p2": detail(projects[1]),
    "/project-time?days=7": () => summariseTime(rows, projects.map((p) => ({ id: p.id, name: p.name, color: p.color })), REAL, "UTC", 7, Date.now()),
  });
  await ctx.route("**/api/projects/*/time", async (route) => {
    const req = route.request();
    const id = new URL(req.url()).pathname.split("/")[3];
    const body = timeRoute(id)(req.method(), { postData: req.postData() });
    await route.fulfill({ json: body });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  // ---- the project page
  await page.goto(`${BASE}/projects/p1`);
  const timer = page.getByRole("timer", { name: "Time spent on this project" });
  await timer.waitFor();
  await page.getByRole("button", { name: "Continue" }).waitFor();
  if (wide) {
    // Top right: "Due in 74 days" and the goal sit to the left of the buttons, on the right side of the header.
    const badge = await page.getByText("Due in 74 days", { exact: true }).first().boundingBox();
    const goal = await page.getByText("Make Fully CRM, Get 5 Lakh", { exact: true }).boundingBox();
    const head = await page.locator("h1").boundingBox();
    const done = await page.getByRole("button", { name: "Mark done" }).boundingBox();
    check("wide: the due badge and the goal are at the top right, left of the buttons (not under the name)", badge.x > head.x + 400 && goal.x > head.x + head.width + 100 && badge.x + badge.width <= done.x + 2 && goal.x + goal.width <= done.x + 2 && badge.y < head.y + 60, JSON.stringify({ badge, goal, head, done }));
  }

  check(`${width}px: the card shows the time already spent (1h 30m + 30m = 2:00:00) and is paused`, (await timer.innerText()).trim() === "2:00:00" && (await page.getByText(/^Paused/).count()) === 1);
  check(`${width}px: next to Tasks and Timeframe, with a Continue button (time exists already)`, (await page.getByText("Time spent", { exact: true }).count()) === 1 && (await page.getByRole("button", { name: "Continue" }).count()) === 1);
  let m = await measure(page, width);
  check(`${width}px: the project page fits the screen with the timer`, !m.zoomedOut && m.mainClipped === 0 && m.offenders.length === 0, JSON.stringify(m));
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/project-timer-${width}.png`, fullPage: true });

  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Pause" }).waitFor();
  check(`${width}px: Continue starts the timer: it says Running and Pause appears`, (await page.getByText(/^Running/).count()) === 1 && posts.join() === "p1:start", posts.join());
  const before = (await timer.innerText()).trim();
  await page.waitForTimeout(2300);
  const after = (await timer.innerText()).trim();
  check(`${width}px: it counts up from the time already spent (not from zero) every second`, before.startsWith("2:00:0") && after !== before && after.startsWith("2:00:0"), `${before} → ${after}`);

  // It keeps running when you leave and come back (the server keeps it).
  await page.goto(`${BASE}/habits`);
  const card = page.locator("section", { has: page.getByRole("heading", { name: "Project & course time" }) });
  await card.waitFor();
  check(`${width}px: Habits → Project & course time shows the running timer and the project`, (await card.getByText(/Timer running on/).count()) === 1 && (await card.getByRole("link", { name: /CRM/ }).count()) >= 1);
  check(`${width}px: it shows this week's time per project (2h 00m, with today's bar) and 7 days`, (await card.getByText("2h 00m").count()) >= 1 && (await card.locator("ol li").count()) === 7, (await card.innerText()).slice(0, 200));
  m = await measure(page, width);
  check(`${width}px: the Habits page fits the screen with Project time`, !m.zoomedOut && m.mainClipped === 0 && m.offenders.length === 0, JSON.stringify(m));
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/habits-project-time-${width}.png`, fullPage: true });
  await page.goto(`${BASE}/projects/p1`);
  await page.getByRole("button", { name: "Pause" }).waitFor();
  check(`${width}px: coming back, the timer is still running`, (await page.getByText(/^Running/).count()) === 1);

  // Another project: starting there leaves this one running (several timers at once).
  await page.goto(`${BASE}/projects/p2`);
  await page.getByRole("button", { name: "Start" }).waitFor();
  check(`${width}px: on another project there is no "running elsewhere" notice, and it shows 0:00:00`, (await page.getByText(/The timer is running on/).count()) === 0 && (await page.getByRole("timer", { name: "Time spent on this project" }).innerText()).trim() === "0:00:00");
  m = await measure(page, width);
  check(`${width}px: a very long project name does not break the layout`, !m.zoomedOut && m.mainClipped === 0 && m.offenders.length === 0, JSON.stringify(m));
  await page.getByRole("button", { name: "Start" }).click();
  await page.getByRole("button", { name: "Pause" }).waitFor();
  check(`${width}px: starting on p2 leaves p1 running`, rows.filter((r) => !r.ended_at).map((r) => r.project_id).sort().join() === "p1,p2");
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: "Pause" }).click();
  await page.getByRole("button", { name: "Continue" }).waitFor();
  check(`${width}px: Pause stops p2 and its time is kept (the button now says Continue)`, rows.filter((r) => !r.ended_at).map((r) => r.project_id).join() === "p1" && /^0:00:0[1-9]$/.test((await page.getByRole("timer", { name: "Time spent on this project" }).innerText()).trim()));
  await page.goto(`${BASE}/projects/p1`);
  await page.getByRole("button", { name: "Pause" }).waitFor();
  await page.getByRole("button", { name: "Pause" }).click();
  await page.getByRole("button", { name: "Continue" }).waitFor();
  const kept = (await page.getByRole("timer", { name: "Time spent on this project" }).innerText()).trim();
  check(`${width}px: the first project kept what it had, plus the seconds it ran`, /^2:00:\d\d$/.test(kept) && kept !== "2:00:00", kept);
  await page.goto(`${BASE}/habits`);
  await card.waitFor();
  // (the saved answer from before may show for a moment: wait for the fresh one)
  await card.getByText(/Timer running on/).waitFor({ state: "detached", timeout: 5000 }).catch(() => undefined);
  check(`${width}px: with no timer running the notice is gone`, (await card.getByText(/Timer running on/).count()) === 0);
  check(`${width}px: no page errors`, errors.length === 0, errors.join("; "));
  await ctx.close();
}

// The Habits card with nothing yet, and a project page that is in the Archive.
{
  const ctx = await newPhone(browser, 390);
  await apiMock(ctx, {
    "/habits?days=7": habitsEmpty,
    "/project-time?days=7": () => summariseTime([], [], REAL, "UTC", 7, Date.now()),
    "/projects/p3": { today: TODAY, project: { ...projects[0], id: "p3", archived_at: "2026-10-05T00:00:00Z", archived_on: "2026-10-05" }, tasks: [] },
    "/projects/p3/time": () => projectState([], "p3", "", REAL, "UTC", Date.now()),
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/habits`);
  await page.getByText("No time kept yet. Open a project or a course and press Start.").waitFor();
  check("Habits → Project time with no time says how to begin", true);
  await page.goto(`${BASE}/projects/p3`);
  await page.getByRole("button", { name: "Start" }).waitFor();
  check("an archived project cannot be timed (Start is disabled)", await page.getByRole("button", { name: "Start" }).isDisabled());
  await ctx.close();
}
await browser.close();
console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
