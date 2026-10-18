// Browser check for Learning step 6 (connect to the rest): revision, goals that follow
// a course, study sessions on the Calendar, and a course's week as tasks.
// The built app must be running on http://localhost:3123.   Run:  node step6-e2e.mjs   (a stand-in API answers; SHOTS=<folder> saves pictures)
import { launch, newPhone, apiMock, measure, BASE, TODAY } from "/home/user/Personal-OS/dev-tools/browser-checks/audit-lib.mjs";

let failures = 0;
const check = (name, ok, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  → " + extra : ""}`);
};

const T1 = "11111111-1111-4111-8111-111111111111"; // ids are UUIDs (the focus timer only keeps a real id)
const LONG = "Search engine optimisation: keyword research for a local business website and its competitors";
const course = (over) => ({ subtitle: "", color: "indigo", est_hours: 40, done_hours: 12, spent_hours: 12, percent: 30, topic_count: 20, unit_count: 5, days_left: 61, state: "on-track", behind_hours: 0, weeks_behind: 0, forecast: null, ...over });
const next = (id, code, over) => ({ topic_id: id, course_id: "c1", course_title: "Digital Marketing", course_color: "indigo", code, title: LONG, status: "not-started", est_hours: 3, hours_left: 3, reason: "next", weeks_late: 0, planned_week: null, ...over });
const weeks = ["2026-08-17", "2026-08-24", "2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05"].map((week_start, i) => ({ week_start, hours: [0, 0, 1, 0, 2, 6, 7.5, 2][i] }));
const week = {
  today: TODAY, week_start: "2026-10-05", topic: "", goal_hours: 6,
  blocks: [{ id: "b1", week_start: "2026-10-05", weekday: 0, hours: 2, activity: "SQL joins", done: true, topic_id: T1, resource_id: null }],
  courses: [course({ id: "c1", title: "Digital Marketing", start_date: "2026-09-14", target_date: "2026-12-06" })],
  study_next: [next(T1, "2.1", { reason: "next" })],
  open_topics: [{ id: T1, course_id: "c1", label: `2.1 ${LONG}`, status: "not-started", hours_left: 3 }],
  library: [{ id: "r1", title: "SQL full course (YouTube playlist)" }],
  stats: { streak: 1, weeks },
  revision: [
    { kind: "topic", id: "t9", title: `1.4 ${LONG}`, label: "Digital Marketing", step: 0, dueAfter: 1, daysSince: 2, href: "/learning/c1" },
    { kind: "resource", id: "r9", title: "SEO basics (Coursera)", label: "Coursera", step: 1, dueAfter: 7, daysSince: 8, href: "/learning/library" },
  ],
  late: 2,
};

const browser = await launch();

// ---------- Learning page: revision ----------
for (const width of [390, 320]) {
  const ctx = await newPhone(browser, width);
  const calls = [];
  await apiMock(ctx, { "/learning/week": week });
  await ctx.route(/\/api\/(learning\/week\/[^/]+|topics\/[^/]+|resources\/[^/]+|learning\/blocks)$/, (route) => {
    const req = route.request();
    if (req.method() === "GET") return route.fulfill({ json: week });
    calls.push({ url: new URL(req.url()).pathname.replace("/api", ""), method: req.method(), body: req.postDataJSON() });
    return route.fulfill({ json: { ok: true } });
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/learning`);
  await page.getByRole("heading", { name: "Study next" }).waitFor();
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/step6-learning-${width}.png`, fullPage: true });
  const m = await measure(page, width);
  check(`${width}px: no zoom-out or overflow with revision and long titles`, !m.zoomedOut && m.mainClipped === 0 && m.offenders.length === 0, JSON.stringify(m));

  const card = page.locator("section[aria-labelledby='next-title']");
  check(`${width}px: "Time to revise" lists a topic and a library item with their look number`, (await card.getByText("Time to revise").count()) === 1 && (await card.getByText("look 1 of 3").count()) === 1 && (await card.getByText("look 2 of 3").count()) === 1);
  calls.length = 0;
  await card.getByRole("button", { name: /Mark 1\.4 .* revised/ }).click();
  await page.waitForTimeout(500);
  const rev = calls.find((c) => c.method === "PATCH" && c.url === "/topics/t9");
  check(`${width}px: "Revised" moves a topic to its next look`, rev?.body?.revision_step === 1, JSON.stringify(rev?.body));
  await card.getByRole("button", { name: "Mark SEO basics (Coursera) revised" }).click();
  await page.waitForTimeout(500);
  const rev2 = calls.find((c) => c.method === "PATCH" && c.url === "/resources/r9");
  check(`${width}px: and a library item`, rev2?.body?.revision_step === 2, JSON.stringify(rev2?.body));

  if (width === 390) {
    check("there is no focus timer any more", (await page.getByRole("button", { name: /focus timer/i }).count()) === 0 && (await page.getByRole("button", { name: "Focus", exact: true }).count()) === 0);
  }
  await ctx.close();
}

// ---------- Goals: one that follows a course, and the form ----------
for (const width of [390, 320]) {
  const ctx = await newPhone(browser, width);
  const calls = [];
  const goal = (over) => ({ id: "g1", title: "Finish Digital Marketing", category_id: null, icon: "target", color: "blue", status: "on-track", progress_mode: "value", current_value: 14.5, target_value: 40, unit: "hours", deadline: null, note: "", completed_on: null, link_kind: "course", course_id: "c1", course_title: "Digital Marketing: the complete practical course for a growing business", linked: true, milestones: [], percent: 36, ...over });
  await apiMock(ctx, {
    "/goals": (method) => (method === "GET" ? { today: TODAY, items: [goal(), goal({ id: "g2", title: "2 certificates", link_kind: "certificates", course_id: null, course_title: null, current_value: 1, target_value: 2, unit: "certificates", percent: 50 }), goal({ id: "g3", title: "Gone course", linked: false, course_title: null, course_id: null, percent: 10 })], summary: { active: 3, on_track: 3, behind: 0, average: 32 } } : { ok: true }),
    "/courses": { today: TODAY, items: [course({ id: "c1", title: "Digital Marketing", est_hours: 40, done_hours: 14.5 })] },
  });
  await ctx.route(/\/api\/goals$/, (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      calls.push(req.postDataJSON());
      return route.fulfill({ status: 201, json: { ok: true } });
    }
    return route.fallback();
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/goals`);
  await page.getByText("Finish Digital Marketing").waitFor();
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/step6-goals-${width}.png`, fullPage: true });
  const m = await measure(page, width);
  check(`${width}px: goals that follow something do not overflow`, !m.zoomedOut && m.mainClipped === 0 && m.offenders.length === 0, JSON.stringify(m));
  check(`${width}px: a goal that follows a course says which`, (await page.getByText(/Follows the course “Digital Marketing: the complete/).count()) === 1);
  check(`${width}px: a goal that follows certificates says so`, (await page.getByText("Counts the certificates you complete").count()) === 1);
  check(`${width}px: a goal whose course is gone says so`, (await page.getByText(/Its course is gone or has no hours/).count()) === 1);
  const updates = await page.getByRole("button", { name: "Update", exact: true }).count();
  check(`${width}px: the hand "Update" button is shown only on the goal that follows nothing live (the gone-course one)`, updates === 1, String(updates));
  if (width === 390) {
    await page.getByRole("button", { name: "New goal" }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#goal-title").fill("Finish the marketing course");
    check("the form offers 'Progress comes from'", (await dialog.locator("#goal-link").count()) === 1);
    await dialog.locator("#goal-link").selectOption("course");
    await dialog.locator("#goal-course").selectOption("c1");
    check("a course hides the hand-typed numbers", (await dialog.locator("#goal-target").count()) === 0 && (await dialog.locator("#goal-current").count()) === 0);
    await dialog.getByRole("button", { name: "Create goal" }).click();
    await page.waitForTimeout(600);
    const sent = calls[0];
    check("it is saved with the course and today's numbers as the fallback", sent?.link_kind === "course" && sent.course_id === "c1" && sent.target_value === 40 && sent.current_value === 14.5 && sent.unit === "hours" && sent.progress_mode === "value", JSON.stringify(sent));
    await page.getByRole("button", { name: "New goal" }).first().click();
    await dialog.locator("#goal-link").selectOption("certificates");
    check("certificates ask for the target only (and the unit)", (await dialog.locator("#goal-target").count()) === 1 && (await dialog.locator("#goal-current").count()) === 0 && (await dialog.locator("#goal-unit").inputValue()) === "certificates");
    await dialog.getByLabel("Milestones I tick").check().catch(() => undefined);
  }
  await ctx.close();
}

// ---------- Calendar: planned study sessions ----------
for (const width of [390, 320]) {
  const ctx = await newPhone(browser, width);
  await apiMock(ctx, {
    "/events": { items: [], today: TODAY, from: "2026-09-28", to: "2026-11-08", study: [{ id: "s1", date: TODAY, hours: 1.5, activity: `2.1 ${LONG}` }, { id: "s2", date: TODAY, hours: 1, activity: "SQL joins" }] },
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/calendar`);
  await page.getByText(/Study 1h 30m:/).first().waitFor();
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/step6-calendar-${width}.png`, fullPage: true });
  const m = await measure(page, width);
  check(`${width}px: planned study on the calendar does not overflow`, !m.zoomedOut && m.mainClipped === 0 && m.offenders.length === 0, JSON.stringify(m));
  check(`${width}px: both sessions are in the day's agenda`, (await page.getByText(/Study 1h:/).count()) >= 1 && (await page.getByText(/Study 1h 30m:/).count()) >= 1);
  await ctx.close();
}

// ---------- Course page: a week's topics as tasks ----------
{
  const ctx = await newPhone(browser, 390);
  const calls = [];
  const topic = (id, code, over = {}) => ({ id, unit_id: "u1", course_id: "c1", code, title: `Topic ${code}`, short_title: "", outcome: "", est_hours: 2, planned_week: 4, status: "not-started", actual_hours: 0, notes: "", position: 0, ...over });
  const detail = {
    today: TODAY,
    course: { id: "c1", title: "Digital Marketing", subtitle: "", quote: "", start_date: "2026-09-14", target_date: "2026-12-06", weekly_plan: [4, 4, 4, 4], color: "blue" },
    units: [{ id: "u1", course_id: "c1", code: "1", title: "SEO", color: "blue", position: 0, topics: [topic("a", "1.1", { actual_hours: 1.25, status: "in-progress" }), topic("b", "1.2", { status: "done", actual_hours: 2 })] }],
  };
  await apiMock(ctx, { "/courses/c1": detail });
  await ctx.route(/\/api\/courses\/c1\/tasks$/, (route) => {
    calls.push({ method: route.request().method(), body: route.request().postDataJSON() });
    return route.fulfill({ json: { created: 1, skipped: 0, due_date: "2026-10-11" } });
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/learning/c1`);
  await page.getByText("Topic 1.1").first().waitFor();
  await page.getByRole("button", { name: "Add to my tasks" }).click();
  await page.waitForTimeout(500);
  check("'Add to my tasks' asks for this week's topics as tasks", calls[0]?.method === "POST", JSON.stringify(calls[0]));
  check("and says what was added, with the due date", (await page.getByText(/1 task added, due Oct 11/).count()) === 1);
  await ctx.close();
}

await browser.close();
console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
