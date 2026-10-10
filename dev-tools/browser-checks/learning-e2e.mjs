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

// ---------- Learning page on a wide screen: My courses is full width, two courses in a row ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const { session } = await import("/home/user/Personal-OS/dev-tools/browser-checks/audit-lib.mjs");
  await ctx.addCookies([{ name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), url: BASE }]);
  const c = (id, title) => ({ id, title, subtitle: "", start_date: "2026-09-14", target_date: "2026-12-31", color: "blue", est_hours: 4, done_hours: 1, spent_hours: 1, percent: 25, topic_count: 2, unit_count: 2, days_left: 80, state: "on-track", behind_hours: 0, weeks_behind: 0, forecast: null });
  await apiMock(ctx, { "/learning/week": { today: TODAY, week_start: "2026-10-05", topic: "", goal_hours: 6, blocks: [{ id: "b1", week_start: "2026-10-05", weekday: 4, hours: 1, activity: "Google Digital Marketing & E-commerce Certificate", done: false, topic_id: null, resource_id: null }], courses: [c("c1", "Digital Marketing"), c("c2", "SQL"), c("c3", "Excel")] } });
  const calls = [];
  await ctx.route(/\/api\/learning\/blocks\/[^/]+$/, (route) => {
    calls.push({ method: route.request().method(), body: route.request().postDataJSON() });
    return route.fulfill({ json: { ok: true } });
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/learning`);
  await page.getByRole("heading", { name: "My courses" }).waitFor();
  const section = page.locator("section[aria-labelledby='courses-title']");
  const main = await page.locator("main").boundingBox();
  const box = await section.boundingBox();
  check("wide: My courses spans the page width", box && main && box.width >= main.width - 70, JSON.stringify({ card: box?.width, main: main?.width }));
  const links = await section.locator("a").evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width) }; }));
  check("wide: two courses share the first row", links.length === 3 && links[0].top === links[1].top && links[1].left > links[0].left && links[2].top > links[0].top, JSON.stringify(links));
  check("wide: both are about the same width (half the card)", Math.abs(links[0].width - links[1].width) <= 2, JSON.stringify(links));
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/learning-wide.png`, fullPage: true });
  // Like a project box: no white card around the boxes, an archive button on each, asking first.
  const outer = await section.evaluate((el) => getComputedStyle(el).backgroundColor);
  check("the boxes sit on the page background (no white card around them)", outer === "rgba(0, 0, 0, 0)", outer);
  const deletes = [];
  await ctx.route(/\/api\/courses\/c1$/, (route) => {
    if (route.request().method() === "DELETE") {
      deletes.push(route.request().url());
      return route.fulfill({ json: { ok: true } });
    }
    return route.fallback();
  });
  await page.getByRole("button", { name: "Archive Digital Marketing" }).click();
  await page.getByRole("button", { name: "Delete course" }).click();
  await page.waitForTimeout(600);
  check("the archive button asks first, then moves the course to the Archive", deletes.length === 1, JSON.stringify(deletes));
  // The week's planned sessions can still be ticked and removed (a closed list under the week in review).
  const details = page.locator("details", { hasText: "Study sessions this week" });
  check("a planned session is listed (closed) so it can still be ticked or removed", (await details.count()) === 1 && (await details.getAttribute("open")) === null);
  await details.locator("summary").click();
  await details.getByLabel(/Done: Friday/).check();
  await page.waitForTimeout(500);
  check("ticking it marks the block done", calls.some((x) => x.method === "PATCH" && x.body.done === true), JSON.stringify(calls));
  await ctx.close();
}

// ---------- Learning page: week arrows ----------
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
  await page.getByText("2 units · 2 topics").first().waitFor();
  check("course card counts units from the units (2 units · 2 topics)", (await page.getByText("2 units · 2 topics").count()) === 1);
  check("course card words: date passed", (await page.getByText("date passed").count()) >= 1);
  check("the old Learning Progress card (weekly goal, topic, planned blocks) is gone", (await page.getByText("Learning Progress").count()) === 0 && (await page.getByText("Planned Learning Blocks").count()) === 0 && (await page.getByLabel("Half an hour more").count()) === 0);

  check("the week arrows are gone (the page is always this week)", (await page.getByLabel("Next week").count()) === 0 && (await page.getByText("Week in review").count()) === 0);

  // session dialog: a day still to come is not 'already done'
  await page.getByRole("button", { name: "Log Study Session" }).click();
  await page.locator("#session-day").waitFor();
  const done = page.getByLabel(/Already done/);
  check("the dialog says it adds to this week", (await page.getByText("It is added as a block for this week.").count()) === 1);
  await page.locator("#session-day").selectOption("6"); // Sunday: still to come
  check("a day still to come is not marked done by default", !(await done.isChecked()));
  await page.locator("#session-day").selectOption("0"); // Monday: already gone
  check("a day gone by is marked done by default", await done.isChecked());
  await ctx.close();
}

await browser.close();
console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
