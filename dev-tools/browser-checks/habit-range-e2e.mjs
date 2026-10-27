// Browser check for the Habits date range: Last 7 days (default), Week, Month with earlier/later arrows, Custom dates with their messages,
// the title and the "In range" column, ticking a day inside a long range, and no page overflow on phones.
// The built app must be running on http://localhost:3123.   Run:  node habit-range-e2e.mjs
import { launch, newPhone, apiMock, measure, BASE, TODAY, session } from "/home/user/Personal-OS/dev-tools/browser-checks/audit-lib.mjs";
import { habitBoard } from "/home/user/Personal-OS/web/lib/server/habits.ts";
import { windowProblem } from "/home/user/Personal-OS/web/lib/habit-range.ts";

let failures = 0;
const check = (name, ok, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  → " + extra : ""}`);
};
const habits = [
  { id: "h1", name: "Read", goal_text: "20 min", icon: "book-open", color: "emerald", position: 0 },
  { id: "h2", name: "Walk with a very long habit name for a phone screen", goal_text: "", icon: "footprints", color: "blue", position: 1 },
];
const logs = [];
for (let i = 0; i < 120; i++) {
  const d = new Date(Date.UTC(2026, 9, 6) - i * 864e5).toISOString().slice(0, 10);
  if (i % 3 !== 1) logs.push({ habit_id: "h1", log_date: d });
  if (i % 4 === 0) logs.push({ habit_id: "h2", log_date: d });
}
const browser = await launch();

for (const width of [390, 320, 1280]) {
  const wide = width >= 1000;
  const ctx = wide ? await browser.newContext({ viewport: { width, height: 900 } }) : await newPhone(browser, width);
  if (wide) await ctx.addCookies([{ name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), url: BASE }]);
  const requests = [];
  const calls = [];
  await apiMock(ctx, {});
  await ctx.route(/\/api\/habits(\?.*)?$/, (route) => {
    const u = new URL(route.request().url());
    requests.push(u.search);
    const from = u.searchParams.get("from"), to = u.searchParams.get("to");
    if (from || to) {
      const problem = windowProblem({ from: from ?? "", to: to ?? "" }, TODAY);
      if (problem) return route.fulfill({ status: 400, json: { error: { message: problem } } });
      return route.fulfill({ json: { today: TODAY, ...habitBoard(habits, logs, TODAY, 7, 20, { from, to }) } });
    }
    return route.fulfill({ json: { today: TODAY, ...habitBoard(habits, logs, TODAY, Number(u.searchParams.get("days") ?? 7)) } });
  });
  await ctx.route(/\/api\/habits\/[^/]+\/logs\/.*/, (route) => {
    calls.push({ method: route.request().method(), path: new URL(route.request().url()).pathname.replace("/api", "") });
    return route.fulfill({ json: { ok: true } });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/habits`);
  const title = page.locator("#tracker-title");
  await title.waitFor();
  const columns = () => page.locator("table thead th").count().then((n) => n - 4); // minus Habit, Streak, range column, actions
  const range = page.getByRole("tablist", { name: "Date range" });

  check(`${width}px: the default is Last 7 days with 7 day columns`, (await title.innerText()) === "Last 7 days" && (await columns()) === 7 && requests.every((r) => r === "?days=7"), JSON.stringify(requests));
  check(`${width}px: the range buttons are Last 7 days, Week, Month, Custom`, JSON.stringify((await range.getByRole("tab").allInnerTexts()).map((x) => x.trim())) === JSON.stringify(["Last 7 days", "Week", "Month", "Custom"]));

  await range.getByRole("tab", { name: "Month" }).click();
  await page.getByText("October 2026", { exact: true }).first().waitFor();
  check(`${width}px: Month shows this month up to today, asks for exact dates and says "In range"`, (await title.innerText()) === "October 2026" && (await columns()) === 6 && requests.at(-1) === "?from=2026-10-01&to=2026-10-06" && (await page.locator("th", { hasText: "In range" }).count()) === 1, `${await title.innerText()} cols=${await columns()} ${requests.at(-1)} inrange=${await page.locator("th", { hasText: "In range" }).count()}`);
  check(`${width}px: the summary card follows the range`, (await page.getByText("October 2026", { exact: true }).count()) >= 2);
  check(`${width}px: you cannot go later than the current month`, await page.getByRole("button", { name: "Later month" }).isDisabled());
  await page.getByRole("button", { name: "Earlier month" }).click();
  await page.getByText("September 2026", { exact: true }).first().waitFor();
  check(`${width}px: the arrow goes to September: 30 columns, month marker, smaller dots`, (await columns()) === 30 && requests.at(-1) === "?from=2026-09-01&to=2026-09-30" && (await page.locator("table thead th", { hasText: "Sep" }).count()) >= 1, requests.at(-1));
  let m = await measure(page, width);
  check(`${width}px: a 30-day table does not widen the page`, !m.zoomedOut && m.mainClipped === 0, JSON.stringify(m));
  const box = await page.locator("table").evaluate((el) => ({ scroll: el.parentElement.scrollWidth, client: el.parentElement.clientWidth }));
  check(`${width}px: it scrolls sideways inside the card${width < 1000 ? "" : " (or fits)"}`, width >= 1000 || box.scroll > box.client, JSON.stringify(box));
  calls.length = 0;
  await page.getByRole("button", { name: /^Read · Tuesday, September 1$/ }).click();
  await page.waitForTimeout(300);
  check(`${width}px: ticking a day inside the range sends that exact date`, calls.length >= 1 && calls[0].path === "/habits/h1/logs/2026-09-01", JSON.stringify(calls));

  await range.getByRole("tab", { name: "Week" }).click();
  await page.waitForFunction(() => /–/.test(document.querySelector("#tracker-title")?.textContent ?? ""));
  check(`${width}px: Week is this calendar week up to today (Monday to today)`, requests.at(-1) === "?from=2026-10-05&to=2026-10-06" && (await title.innerText()) === "Oct 5 – Oct 6", `${requests.at(-1)} ${await title.innerText()}`);
  await page.getByRole("button", { name: "Earlier week" }).click();
  await page.waitForFunction(() => document.querySelector("#tracker-title")?.textContent === "Sep 28 – Oct 4");
  check(`${width}px: the earlier week is whole (7 columns)`, (await columns()) === 7);

  // custom dates
  await range.getByRole("tab", { name: "Custom" }).click();
  const from = page.locator("#range-from"), to = page.locator("#range-to");
  await from.waitFor();
  await from.fill("2026-09-10");
  await to.fill("2026-09-01");
  check(`${width}px: an end before the start is explained and nothing more is asked`, (await page.getByText(/end date cannot be before/).count()) === 1 && requests.at(-1) === "?from=2026-09-10&to=2026-10-06", requests.at(-1));
  await from.fill("2026-05-01");
  await to.fill("2026-10-06");
  check(`${width}px: more than 92 days is explained`, (await page.getByText(/at most 92 days/).count()) === 1);
  await from.fill("2026-09-01");
  await to.fill("2026-09-10");
  await page.waitForFunction(() => document.querySelector("#tracker-title")?.textContent === "Sep 1 – Sep 10");
  check(`${width}px: valid dates show that range (10 columns, "10 days")`, (await columns()) === 10 && requests.at(-1) === "?from=2026-09-01&to=2026-09-10" && (await page.getByText("10 days", { exact: true }).count()) === 1, requests.at(-1));
  m = await measure(page, width);
  check(`${width}px: the custom range bar fits the screen`, !m.zoomedOut && m.mainClipped === 0, JSON.stringify(m));
  await range.getByRole("tab", { name: "Last 7 days" }).click();
  await page.waitForFunction(() => document.querySelector("#tracker-title")?.textContent === "Last 7 days");
  check(`${width}px: back to Last 7 days`, (await columns()) === 7);
  check(`${width}px: no page errors`, errors.length === 0, errors.join("; "));
  await ctx.close();
}
await browser.close();
console.log(failures ? `${failures} CHECK(S) FAILED` : "ALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
