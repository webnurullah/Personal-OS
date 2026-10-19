// Browser check for habit time goals: a habit with a daily time goal shows today's time against it, the habit form sets the goal and the
// projects and courses that count for it, a plain habit stays as it was, and ticking by hand still works.
// The built app must be running on http://localhost:3123.   Run:  node habit-goal-e2e.mjs
import { launch, newPhone, apiMock, measure, BASE, TODAY, session } from "/home/user/Personal-OS/dev-tools/browser-checks/audit-lib.mjs";

let failures = 0;
const check = (name, ok, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  → " + extra : ""}`);
};
const days = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06"];
const habit = (id, name, over = {}) => ({ id, name, goal_text: "2 hours daily", icon: "footprints", color: "emerald", position: 0, done: [false, false, false, false, false, false], streak: 0, share: 0, ...over });
const browser = await launch();

for (const width of [390, 320, 1280]) {
  const wide = width >= 1000;
  const ctx = wide ? await browser.newContext({ viewport: { width, height: 900 } }) : await newPhone(browser, width);
  if (wide) await ctx.addCookies([{ name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), url: BASE }]);
  const items = [
    habit("h1", "Personal Project", { target_minutes: 120, today_minutes: 72, sources: [{ kind: "project", id: "p1", name: "CRM" }] }),
    habit("h2", "Digital Learning", { target_minutes: 60, today_minutes: 60, done: [false, false, false, false, false, true], sources: [{ kind: "course", id: "c1", name: "Digital Marketing" }] }),
    habit("h3", "Walk", { goal_text: "5,000 steps" }),
    habit("h4", "NWC Work", { target_minutes: 20, today_minutes: 0, sources: [] }),
  ];
  const calls = [];
  await apiMock(ctx, {
    "/habits?days=7": () => ({ today: TODAY, days, items, heatmap: [], summary: { total: 4, done_today: 1, best: { days: 0, name: "" }, share: 0, perfect_days: 0, most_consistent: null, needs_attention: null } }),
    "/projects": { items: [{ id: "p1", name: "CRM", status: "active" }, { id: "p2", name: "Blog", status: "active" }], today: TODAY },
    "/courses": { items: [{ id: "c1", title: "Digital Marketing", status: "active" }], today: TODAY },
    "/project-time?days=7": { today: TODAY, days, projects: [], today_seconds: 0, week_seconds: 0, total_seconds: 0, running: null, now: new Date().toISOString() },
  });
  await ctx.route(/\/api\/habits\/[^/]+(\/logs\/.*)?$/, (route) => {
    const req = route.request();
    calls.push({ method: req.method(), path: new URL(req.url()).pathname.replace("/api", ""), body: req.postData() ? JSON.parse(req.postData()) : undefined });
    return route.fulfill({ json: { ok: true } });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/habits`);
  await page.getByText("1h 12m of 2h today").first().waitFor();
  check(`${width}px: a habit with a time goal shows today's time against it`, (await page.getByText("1h 12m of 2h today").count()) >= 1);
  check(`${width}px: a reached goal shows in full, a habit without a time goal shows nothing extra`, (await page.getByText("1h of 1h today").count()) >= 1 && (await page.getByText(/5,000 steps/).count()) >= 1 && (await page.getByText(/of .* today/).count()) === (await page.getByText(/(1h 12m of 2h|1h of 1h|0m of 20m) today/).count()));
  check(`${width}px: a goal with nothing picked says so`, (await page.getByText("No project or course picked").count()) >= 1);
  const m = await measure(page, width);
  check(`${width}px: the Habits page fits the screen`, !m.zoomedOut && m.mainClipped === 0, JSON.stringify(m));

  // Edit the time-goal habit: goal and the pick are filled in; change and save.
  await page.getByRole("button", { name: /Edit Personal Project/ }).first().click();
  const minutes = page.locator("#habit-minutes");
  await minutes.waitFor();
  check(`${width}px: only one goal field shows (the timer goal, not the words)`, (await page.locator("#habit-goal").count()) === 0);
  check(`${width}px: the form has the goal and the picked project`, (await minutes.inputValue()) === "120" && (await page.getByRole("checkbox", { name: /CRM/ }).isChecked()) && !(await page.getByRole("checkbox", { name: /Blog/ }).isChecked()));
  await page.getByRole("checkbox", { name: /Blog/ }).check();
  await page.getByRole("checkbox", { name: /Digital Marketing/ }).check();
  await page.getByRole("button", { name: "30m" }).click();
  calls.length = 0;
  await page.getByRole("button", { name: "Save habit" }).click();
  await page.waitForTimeout(500);
  const saved = calls.find((c) => c.method === "PATCH" && c.path === "/habits/h1");
  if (!saved) console.log("CALLS", JSON.stringify(calls), (await page.locator("[role=status], [role=alert]").allInnerTexts()).join("|"));
  check(`${width}px: saving sends the goal and the picked projects and courses`, saved && saved.body.target_minutes === 30 && saved.body.goal_text === "30m daily" && JSON.stringify(saved.body.sources.map((s) => `${s.kind}:${s.id}`).sort()) === JSON.stringify(["course:c1", "project:p1", "project:p2"]), JSON.stringify(saved?.body));

  // Remove the time goal.
  await page.getByRole("button", { name: /Edit Personal Project/ }).first().click();
  await page.getByRole("tab", { name: "I tick it myself" }).click();
  check(`${width}px: one goal at a time: the words field replaces the time goal`, (await page.locator("#habit-goal").count()) === 1 && (await page.locator("#habit-minutes").count()) === 0);
  check(`${width}px: ticking it yourself hides the picks`, (await page.getByText("Counts time from").count()) === 0);
  calls.length = 0;
  await page.getByRole("button", { name: "Save habit" }).click();
  await page.waitForTimeout(500);
  const plain = calls.find((c) => c.method === "PATCH" && c.path === "/habits/h1");
  check(`${width}px: no time goal sends null and no sources`, plain && plain.body.target_minutes === null && plain.body.sources.length === 0, JSON.stringify(plain?.body));

  // Ticking by hand still works on a time-goal habit.
  calls.length = 0;
  await page.getByRole("button", { name: /^Personal Project · Today$/ }).first().click();
  await page.waitForTimeout(400);
  check(`${width}px: ticking today by hand still works`, calls.some((c) => c.method === "PUT" && c.path.startsWith("/habits/h1/logs/")), JSON.stringify(calls));
  check(`${width}px: no page errors`, errors.length === 0, errors.join("; "));
  await ctx.close();
}
await browser.close();
console.log(failures ? `${failures} CHECK(S) FAILED` : "ALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
