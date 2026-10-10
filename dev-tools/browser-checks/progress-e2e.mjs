// Browser check for Learning → "Learning progress and time" (week / month / quarter) and the order of the page.
// The built app must be running on http://localhost:3123.   Run:  node progress-e2e.mjs   (a stand-in API answers; SHOTS=<folder> saves pictures)
import { launch, newPhone, apiMock, measure, BASE, TODAY } from "/home/user/Personal-OS/dev-tools/browser-checks/audit-lib.mjs";
import { buildProgress } from "/home/user/Personal-OS/web/lib/progress.ts";

let failures = 0;
const check = (name, ok, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  → " + extra : ""}`);
};

const LONG = "Search engine optimisation: keyword research for a local business website and its competitors";
const sessions = [
  { date: "2026-10-05", hours: 1.5, course_id: "c1", library: false },
  { date: "2026-10-06", hours: 2, course_id: "c1", library: false },
  { date: "2026-09-29", hours: 4, course_id: "c2", library: false },
  { date: "2026-09-22", hours: 7, course_id: "c1", library: false },
  { date: "2026-09-10", hours: 3, course_id: null, library: true },
  { date: "2026-08-12", hours: 5, course_id: "c2", library: false },
  { date: "2026-07-20", hours: 6, course_id: "c1", library: false },
];
const progress = buildProgress({ today: TODAY, weeklyGoal: 6, sessions, topicDays: ["2026-10-06", "2026-09-29"], itemDays: ["2026-10-02"], courseTitles: { c1: LONG, c2: "SQL" } });
const course = (id, title) => ({ id, title, subtitle: "", color: "blue", start_date: "2026-09-14", target_date: "2026-12-31", est_hours: 4, done_hours: 1, spent_hours: 1, percent: 25, topic_count: 2, unit_count: 2, days_left: 80, state: "on-track", behind_hours: 0, weeks_behind: 0, forecast: null });
const week = { today: TODAY, week_start: "2026-10-05", topic: "", goal_hours: 6, blocks: [], courses: [course("c1", LONG), course("c2", "SQL")], study_next: [], open_topics: [], library: [], stats: { streak: 0, weeks: [] }, revision: [], late: 0 };

const browser = await launch();

for (const width of [390, 320, 1280]) {
  const ctx = width >= 1000 ? await browser.newContext({ viewport: { width, height: 900 } }) : await newPhone(browser, width);
  if (width >= 1000) {
    const { session } = await import("/home/user/Personal-OS/dev-tools/browser-checks/audit-lib.mjs");
    await ctx.addCookies([{ name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), url: BASE }]);
  }
  await apiMock(ctx, { "/learning/week": week, "/learning/progress": { today: TODAY, weekly_goal: 6, ...progress } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/learning`);
  const card = page.locator("section[aria-labelledby='progress-title']");
  await card.getByRole("heading", { name: /Learning progress and time/ }).waitFor();
  await card.getByText("studied", { exact: false }).first().waitFor();
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/progress-${width}.png`, fullPage: true });
  const m = await measure(page, width);
  check(`${width}px: no zoom-out or overflow (long course name in the time split)`, !m.zoomedOut && m.mainClipped === 0 && m.offenders.length === 0, JSON.stringify(m));

  // Order: My courses, Study next (when it has anything), then the progress section.
  const y = async (sel) => (await page.locator(sel).first().boundingBox())?.y ?? -1;
  const yCourses = await y("section[aria-labelledby='courses-title']");
  const yProgress = await y("section[aria-labelledby='progress-title']");
  check(`${width}px: the progress section is below My courses`, yCourses > 0 && yProgress > yCourses, `${yCourses} < ${yProgress}`);

  const bars = card.locator("button[aria-pressed]");
  check(`${width}px: weekly shows 8 bars, the current one marked Now`, (await bars.count()) === 8 && (await card.getByText("Now", { exact: true }).count()) === 1);
  check(`${width}px: the current week: 3.5h of 6h, with the pace`, (await card.getByText("3h 30m").count()) >= 1 && (await card.getByText(/goal 6h · 58%/).count()) === 1 && (await card.getByText(/(ahead of|behind) pace|On pace/).count()) === 1, await card.innerText().then((t) => t.slice(0, 400)));
  check(`${width}px: study days, sessions, finished topics and library items`, (await card.getByText("2 of 2").count()) === 1 && (await card.getByText("Topics finished").count()) === 1);
  check(`${width}px: where the time went names the courses`, (await card.getByText("Where the time went").count()) === 1 && (await card.getByText(LONG).count()) >= 1);

  // A past bar: the week of Sep 28 (4h on SQL).
  await bars.nth(6).click();
  check(`${width}px: tapping a past week shows that week`, (await card.getByRole("heading", { name: "Sep 28 – Oct 4" }).count()) === 1 && (await card.getByText(/short of the goal|Goal reached/).count()) === 1 && (await card.getByText("SQL", { exact: true }).count()) >= 1);

  await card.getByRole("tab", { name: "Monthly" }).click();
  check(`${width}px: monthly shows 6 bars; the current month is October, 3.5h`, (await bars.count()) === 6 && (await card.getByRole("heading", { name: "October 2026" }).count()) === 1);
  const mm = await measure(page, width);
  check(`${width}px: monthly does not overflow`, !mm.zoomedOut && mm.mainClipped === 0 && mm.offenders.length === 0, JSON.stringify(mm));
  await card.getByRole("tab", { name: "Quarterly" }).click();
  check(`${width}px: quarterly shows 4 bars; this quarter is Q4 2026`, (await bars.count()) === 4 && (await card.getByRole("heading", { name: /Q4 2026/ }).count()) === 1);
  await bars.nth(2).click();
  check(`${width}px: tapping Q3 shows Q3`, (await card.getByRole("heading", { name: /Q3 2026/ }).count()) === 1);
  await card.getByRole("tab", { name: "Weekly" }).click();
  check(`${width}px: going back to weekly returns to the current week`, (await card.getByText("This week", { exact: true }).count()) === 1);
  await ctx.close();
}

// While it loads (or when the answer is an old shape), the section shows a placeholder, not an error.
{
  const ctx = await newPhone(browser, 390);
  await apiMock(ctx, { "/learning/week": week });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/learning`);
  await page.getByRole("heading", { name: /Learning progress and time/ }).waitFor();
  check("an empty answer leaves a quiet placeholder and no crash", (await page.getByText("This page couldn’t load").count()) === 0);
  await ctx.close();
}

await browser.close();
console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
