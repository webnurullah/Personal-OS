// Browser check for Learning step 1 (bug fixes). The built app must be running on http://localhost:3123.
import { launch, newPhone, apiMock, measure, BASE, TODAY } from "/home/user/Personal-OS/dev-tools/browser-checks/audit-lib.mjs";

let failures = 0;
const check = (name, ok, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  → " + extra : ""}`);
};

const topic = (id, unit, code, over = {}) => ({ id, unit_id: unit, course_id: "c1", code, title: `Topic ${code}`, short_title: "", outcome: "", est_hours: 2, planned_week: 1, status: "not-started", actual_hours: 0, notes: "", position: 0, ...over });
// 3-week course that ended on 2026-10-04 (today in the mock is 2026-10-06). Unit 2 has no topics yet. Topic 1.3 is planned in week 20 (beyond the end).
const detail = {
  today: TODAY,
  course: { id: "c1", title: "Digital Marketing", subtitle: "", quote: "", start_date: "2026-09-14", target_date: "2026-10-04", weekly_plan: [4, 4, 4], color: "blue" },
  units: [
    { id: "u1", course_id: "c1", code: "1", title: "SEO", color: "blue", position: 0, topics: [topic("t1", "u1", "1.1", { actual_hours: 1.25 }), topic("t3", "u1", "1.3", { planned_week: 20, position: 2 })] },
    { id: "u2", course_id: "c1", code: "2", title: "", color: "green", position: 1, topics: [] },
  ],
};
const week = (start, goal = 8) => ({ today: TODAY, week_start: start, topic: "", goal_hours: goal, blocks: [], courses: [{ id: "c1", title: "Digital Marketing", subtitle: "", start_date: "2026-09-14", target_date: "2026-10-04", color: "blue", est_hours: 4, done_hours: 1.25, spent_hours: 1.25, percent: 31, topic_count: 2, unit_count: 2, days_left: -2 }] });

const browser = await launch();

// ---------- Course page on a phone ----------
{
  const ctx = await newPhone(browser, 390);
  const calls = [];
  await apiMock(ctx, { "/courses/c1": detail });
  await ctx.route("**/api/topics/**", (route) => {
    const req = route.request();
    calls.push({ url: new URL(req.url()).pathname, method: req.method(), body: req.postDataJSON() });
    return route.fulfill({ json: { ok: true } });
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/learning/c1`);
  await page.getByText("Topic 1.1").first().waitFor();
  const m = await measure(page, 390);
  check("phone: page does not zoom out or overflow", !m.zoomedOut && m.mainClipped === 0, JSON.stringify(m));
  check("phone: only one set of hour boxes is on the page", (await page.getByLabel("Actual hours for topic 1.1").count()) === 1);
  check("after the end the plan card says Last Week's Plan", (await page.getByText("Last Week's Plan").count()) === 1);
  check("date passed wording on the tile", (await page.getByText("(date passed)").count()) === 1);

  // the box shows 1.25 and keeps quarter hours
  const box = page.getByLabel("Actual hours for topic 1.1");
  check("quarter hour value is kept in the box", (await box.inputValue()) === "1.25");
  await box.fill("1500");
  await box.blur();
  check("a value over the limit is shown as the limit when leaving the box", (await box.inputValue()) === "1000", await box.inputValue());
  await page.waitForTimeout(1200);
  const patch = calls.find((c) => c.method === "PATCH" && c.url.endsWith("/t1"));
  check("the saved value is the limited one", patch?.body?.actual_hours === 1000, JSON.stringify(patch));

  // add topic: next number is 1.4 (1.1 and 1.3 exist), duplicate is warned
  await page.getByRole("button", { name: /Add topic to SEO/ }).click();
  const code = page.locator("#topic-code");
  check("next topic number skips used numbers", (await code.inputValue()) === "1.4", await code.inputValue());
  await code.fill("1.1");
  check("a used number is warned about", (await page.getByText("already used").count()) === 1);
  await page.keyboard.press("Escape");

  // edit topic planned beyond the end: the week stays visible and an unchanged week is not sent
  await page.getByLabel("Edit topic 1.3").click();
  const weekSelect = page.locator("#topic-week");
  check("a week after the course end stays selectable and selected", (await weekSelect.inputValue()) === "20", await weekSelect.inputValue());
  check("it is labelled as after the end", (await weekSelect.locator("option:checked").textContent())?.includes("after the end") === true);
  calls.length = 0;
  await page.locator("#topic-title").fill("Renamed topic");
  await page.getByRole("button", { name: "Save topic" }).click();
  await page.waitForTimeout(500);
  const save = calls.find((c) => c.method === "PATCH" && c.url.endsWith("/t3"));
  check("saving without touching the week does not send the week", save && !("planned_week" in save.body), JSON.stringify(save?.body));

  // add unit: next number is 3
  await page.getByRole("button", { name: /Add unit/ }).first().click();
  check("next unit number is one more than the highest", (await page.locator("#unit-code").inputValue()) === "3");
  await ctx.close();
}

// ---------- Course page on a wide screen ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const { session } = await import("/home/user/Personal-OS/dev-tools/browser-checks/audit-lib.mjs");
  await ctx.addCookies([{ name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), url: BASE }]);
  await apiMock(ctx, { "/courses/c1": detail });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/learning/c1`);
  await page.getByText("Topic 1.1").first().waitFor();
  check("wide: table is shown, one set of hour boxes", (await page.locator("table").count()) >= 1 && (await page.getByLabel("Actual hours for topic 1.1").count()) === 1);
  await ctx.close();
}

// ---------- Learning page: goal clicks and week arrows ----------
{
  const ctx = await newPhone(browser, 390);
  const puts = [];
  const asked = [];
  await apiMock(ctx);
  await ctx.route("**/api/learning/week**", async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    if (req.method() === "PUT") {
      puts.push(req.postDataJSON());
      return route.fulfill({ json: { ok: true } });
    }
    asked.push(u.searchParams.get("start"));
    await new Promise((r) => setTimeout(r, 600)); // a slow connection
    return route.fulfill({ json: week(u.searchParams.get("start") ?? "2026-10-05") });
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/learning`);
  await page.getByText("8 hours").first().waitFor();
  check("course card counts units from the units (2 units · 2 topics)", (await page.getByText("2 units · 2 topics").count()) === 1);
  check("course card words: date passed", (await page.getByText("date passed").count()) >= 1);

  const more = page.getByLabel("Half an hour more");
  await more.click();
  await more.click();
  await more.click();
  check("goal shows the clicks at once", (await page.getByText("9.5 hours").count()) === 1);
  await page.waitForTimeout(1200);
  check("fast clicks are saved once from the latest value", puts.length === 1 && puts[0].goal_hours === 9.5, JSON.stringify(puts));

  asked.length = 0;
  const next = page.getByLabel("Next week");
  await next.click();
  await next.click();
  await page.waitForTimeout(1500);
  check("two quick clicks on Next go two weeks ahead", asked.includes("2026-10-19"), JSON.stringify(asked));

  // session dialog: a day still to come is not 'already done'; it names the week
  await page.getByRole("button", { name: "Log Study Session" }).click();
  await page.locator("#session-day").waitFor();
  const done = page.getByLabel(/Already done/);
  const desc = await page.getByText(/It is added to the week of/).count();
  check("the dialog names the week when it is not this week", desc === 1);
  check("a future week's day is not marked done by default", !(await done.isChecked()));
  await ctx.close();
}

await browser.close();
console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
