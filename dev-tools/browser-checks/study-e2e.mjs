// Browser check for Learning step 4 (one progress record + "Study next"). The built app must be running on http://localhost:3123.
// Run:  node study-e2e.mjs        (a stand-in API answers; nothing real is touched; SHOTS=<folder> also saves pictures)
import { launch, newPhone, apiMock, measure, BASE, TODAY } from "/home/user/Personal-OS/dev-tools/browser-checks/audit-lib.mjs";

let failures = 0;
const check = (name, ok, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  → " + extra : ""}`);
};

const LONG = "Search engine optimisation: keyword research for a local business website and its competitors";
const course = (over) => ({ subtitle: "", color: "indigo", est_hours: 40, done_hours: 12, spent_hours: 12, percent: 30, topic_count: 20, unit_count: 5, days_left: 61, state: "on-track", behind_hours: 0, weeks_behind: 0, forecast: null, ...over });
const weeks = ["2026-08-17", "2026-08-24", "2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05"].map((week_start, i) => ({ week_start, hours: [0, 0, 1, 0, 2, 6, 7.5, 2][i] }));
const next = (id, code, over) => ({ topic_id: id, course_id: "c1", course_title: "Digital Marketing: the complete practical course", course_color: "indigo", code, title: LONG, status: "not-started", est_hours: 3, hours_left: 3, planned_week: 4, reason: "this-week", weeks_late: 0, ...over });
const week = {
  today: TODAY, week_start: "2026-10-05", topic: "", goal_hours: 6, blocks: [],
  courses: [
    course({ id: "c1", title: "Digital Marketing: the complete practical course", start_date: "2026-09-14", target_date: "2026-12-06", state: "behind", behind_hours: 3.5, weeks_behind: 2, forecast: { date: "2026-12-20", days_late: 14 } }),
    course({ id: "c2", title: "SQL", start_date: "2026-10-01", target_date: "2026-11-30", color: "teal" }),
  ],
  study_next: [
    next("t1", "2.1", { status: "in-progress", hours_left: 1.5, reason: "overdue", weeks_late: 2, planned_week: 2 }),
    next("t2", "2.2", {}),
    next("t3", "1.1", { course_id: "c2", course_title: "SQL", title: "SELECT basics", reason: "next", planned_week: null }),
  ],
  open_topics: [
    { id: "t1", course_id: "c1", label: `2.1 ${LONG}`, status: "in-progress", hours_left: 1.5 },
    { id: "t2", course_id: "c1", label: `2.2 ${LONG}`, status: "not-started", hours_left: 3 },
    { id: "t3", course_id: "c2", label: "1.1 SELECT basics", status: "not-started", hours_left: 3 },
  ],
  library: [{ id: "r1", title: "SQL full course (YouTube playlist)" }],
  stats: { streak: 3, weeks },
};

const topic = (id, code, over = {}) => ({ id, unit_id: "u1", course_id: "c1", code, title: `Topic ${code}`, short_title: "", outcome: "", est_hours: 2, planned_week: 4, status: "not-started", actual_hours: 0, notes: "", position: 0, ...over });
const detail = {
  today: TODAY,
  course: { id: "c1", title: "Digital Marketing", subtitle: "", quote: "", start_date: "2026-09-14", target_date: "2026-12-06", weekly_plan: [4, 4, 4, 4], color: "blue" },
  units: [{ id: "u1", course_id: "c1", code: "1", title: "SEO", color: "blue", position: 0, topics: [topic("a", "1.1", { actual_hours: 1.25, status: "in-progress" }), topic("b", "1.2", { status: "done", actual_hours: 2 })] }],
};

const browser = await launch();

for (const width of [390, 320]) {
  const ctx = await newPhone(browser, width);
  const calls = [];
  await apiMock(ctx, { "/learning/week": week });
  await ctx.route(/\/api\/(learning\/blocks|topics\/[^/]+)$/, (route) => {
    const req = route.request();
    calls.push({ url: new URL(req.url()).pathname.replace("/api", ""), method: req.method(), body: req.postDataJSON() });
    return route.fulfill({ json: { ok: true } });
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/learning`);
  await page.getByRole("heading", { name: "Study next" }).waitFor();

  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/study-next-${width}.png`, fullPage: true });
  const m = await measure(page, width);
  check(`${width}px: the Learning page does not zoom out or overflow`, !m.zoomedOut && m.mainClipped === 0 && m.offenders.length === 0, JSON.stringify(m));
  const card = page.locator("section[aria-labelledby='next-title']");
  check(`${width}px: three topics are listed`, (await card.locator("li").count()) === 3);
  check(`${width}px: the reasons are shown`, (await card.getByText("2 weeks behind").count()) === 1 && (await card.getByText("planned for this week").count()) === 1 && (await card.getByText("next in the course").count()) === 1);
  check(`${width}px: hours left are shown`, (await card.getByText("1h 30m left").count()) === 1);
  check(`${width}px: the streak and the 8 bars are shown`, (await card.getByText("3 weeks in a row").count()) === 1 && (await card.locator("[role=img] span").count()) === 8);
  check(`${width}px: a course that is behind says so, with the forecast`, (await page.getByText("Behind: 3h 30m to catch up (2 weeks late)").count()) === 1 && (await page.getByText(/At your pace: .*14 days after the target/).count()) === 1);
  check(`${width}px: a course without a forecast shows none`, (await page.getByText(/At your pace/).count()) === 1);

  if (width === 390) {
    // "Log time" opens the session form on that topic, with its words filled in.
    await card.getByRole("button", { name: "Log time" }).first().click();
    const dialog = page.getByRole("dialog");
    const pick = dialog.locator("#session-pick");
    check("Log time opens the form on that topic", (await pick.inputValue()) === "t:t1", await pick.inputValue());
    const what = dialog.locator("#session-what");
    check("its words are filled in from the topic", (await what.inputValue()) === `2.1 ${LONG}`);
    check("the hours left on the topic are said", (await dialog.getByText("1h 30m left on this topic").count()) === 1);
    if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/study-form-${width}.png` });
    const mm = await measure(page, width);
    check("the form does not overflow with a very long topic", !mm.zoomedOut && mm.mainClipped === 0 && mm.offenders.length === 0, JSON.stringify(mm));

    // Picking another topic changes the words; words typed by hand are kept.
    await pick.selectOption("t:t3");
    check("picking another topic changes the words", (await what.inputValue()) === "1.1 SELECT basics");
    await pick.selectOption("r:r1");
    check("a library item gives its title", (await what.inputValue()) === "SQL full course (YouTube playlist)");
    await what.fill("My own words");
    await pick.selectOption("t:t2");
    check("words typed by hand are kept", (await what.inputValue()) === "My own words");
    check("a topic offers the 'finished' tick", (await dialog.getByLabel("I finished this topic").count()) === 1);
    // Words that are still the old pick's (with something added) follow the new pick; the user's own words stay.
    await what.fill("");
    await pick.selectOption("t:t3");
    await what.fill(`${await what.inputValue()} practice`);
    await pick.selectOption("t:t2");
    check("words that began as the old pick's follow the new pick", (await what.inputValue()) === `2.2 ${LONG}`, await what.inputValue());

    // Save: the session names the topic and the topic is marked finished.
    await pick.selectOption("t:t1");
    await dialog.getByLabel("I finished this topic").check();
    calls.length = 0;
    await dialog.getByRole("button", { name: "Add block" }).click();
    await page.waitForTimeout(700);
    const post = calls.find((c) => c.method === "POST" && c.url === "/learning/blocks");
    check("the session is saved with its topic, done, no library item", post?.body?.topic_id === "t1" && post.body.resource_id === null && post.body.done === true && post.body.hours === 1 && post.body.week_start === "2026-10-05" && post.body.weekday === 1, JSON.stringify(post?.body));
    const patch = calls.find((c) => c.method === "PATCH" && c.url === "/topics/t1");
    check("'I finished this topic' marks the topic done", patch?.body?.status === "done", JSON.stringify(patch?.body));

    // A library session.
    await card.getByRole("button", { name: "Log time" }).nth(2).click();
    await page.locator("#session-pick").selectOption("r:r1");
    calls.length = 0;
    await page.getByRole("dialog").getByRole("button", { name: "Add block" }).click();
    await page.waitForTimeout(700);
    const lib = calls.find((c) => c.method === "POST" && c.url === "/learning/blocks");
    check("a library session names the item and no topic", lib?.body?.resource_id === "r1" && lib.body.topic_id === null, JSON.stringify(lib?.body));

    // The plain button still works: nothing picked.
    await page.getByRole("button", { name: "Log Study Session" }).click();
    check("the header button opens the form on 'Something else'", (await page.locator("#session-pick").inputValue()) === "");
    await page.keyboard.press("Escape");

    // Done on the second item.
    calls.length = 0;
    await card.getByRole("button", { name: /Mark 2.2 .* finished/ }).click();
    await page.waitForTimeout(500);
    const done = calls.find((c) => c.method === "PATCH" && c.url === "/topics/t2");
    check("Done marks that topic finished", done?.body?.status === "done", JSON.stringify(done?.body));
  }
  await ctx.close();
}

// ---------- The course page on a phone: +30m / +1h ----------
{
  const ctx = await newPhone(browser, 390);
  const calls = [];
  let added = 0; // the stand-in server keeps the hours it was given, as the database does
  const withHours = () => ({ ...detail, units: [{ ...detail.units[0], topics: detail.units[0].topics.map((t) => (t.id === "a" ? { ...t, actual_hours: Number(t.actual_hours) + added } : t)) }] });
  await apiMock(ctx, { "/courses/c1": () => withHours() });
  await ctx.route(/\/api\/learning\/blocks$/, (route) => {
    const req = route.request();
    calls.push({ method: req.method(), body: req.postDataJSON() });
    added += req.postDataJSON().hours;
    return route.fulfill({ json: { ok: true } });
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/learning/c1`);
  await page.getByText("Topic 1.1").first().waitFor();
  const m = await measure(page, 390);
  check("course page: no zoom-out or overflow with the chips", !m.zoomedOut && m.mainClipped === 0 && m.offenders.length === 0, JSON.stringify(m));
  check("course page: chips on an open topic", (await page.getByRole("button", { name: "Add 30m to topic 1.1" }).count()) === 1 && (await page.getByRole("button", { name: "Add 1h to topic 1.1" }).count()) === 1);
  check("course page: none on a finished topic", (await page.getByRole("button", { name: /Add .* to topic 1.2/ }).count()) === 0);
  await page.getByRole("button", { name: "Add 1h to topic 1.1" }).click();
  await page.waitForTimeout(600);
  const post = calls.find((c) => c.method === "POST");
  check("+1h saves a finished session for today that names the topic", post?.body?.topic_id === "a" && post.body.hours === 1 && post.body.done === true && post.body.week_start === "2026-10-05" && post.body.weekday === 1 && post.body.activity === "1.1 Topic 1.1", JSON.stringify(post?.body));
  check("the Spent box shows the new total at once", (await page.getByLabel("Actual hours for topic 1.1").inputValue()) === "2.25", await page.getByLabel("Actual hours for topic 1.1").inputValue());
  await ctx.close();
}

// ---------- +1h that fails: the numbers go back to what was saved ----------
{
  const ctx = await newPhone(browser, 390);
  await apiMock(ctx, { "/courses/c1": detail });
  await ctx.route(/\/api\/learning\/blocks$/, (route) => route.fulfill({ status: 500, json: { error: { message: "The database is down" } } }));
  const page = await ctx.newPage();
  await page.goto(`${BASE}/learning/c1`);
  await page.getByText("Topic 1.1").first().waitFor();
  await page.getByRole("button", { name: "Add 1h to topic 1.1" }).click();
  await page.waitForTimeout(800);
  check("a failed +1h shows the saved hours again", (await page.getByLabel("Actual hours for topic 1.1").inputValue()) === "1.25", await page.getByLabel("Actual hours for topic 1.1").inputValue());
  await ctx.close();
}

// ---------- Two taps that both fail, and a typed total that the database raises ----------
{
  const ctx = await newPhone(browser, 390);
  let kept = 1.25; // the stand-in database keeps what it was given, but never less than the sessions (3h)
  const served = () => ({ ...detail, units: [{ ...detail.units[0], topics: detail.units[0].topics.map((t) => (t.id === "a" ? { ...t, actual_hours: kept } : t)) }] });
  await apiMock(ctx, { "/courses/c1": () => served() });
  await ctx.route(/\/api\/learning\/blocks$/, async (route) => {
    await new Promise((r) => setTimeout(r, 150));
    return route.fulfill({ status: 500, json: { error: { message: "The database is down" } } });
  });
  // Spent cannot be lower than the sessions: typing 1 is kept as 3.
  await ctx.route(/\/api\/topics\/a$/, (route) => {
    if (route.request().method() === "GET") return route.fallback();
    kept = 3;
    return route.fulfill({ json: { ...detail.units[0].topics[0], actual_hours: 3 } });
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/learning/c1`);
  await page.getByText("Topic 1.1").first().waitFor();
  const box = page.getByLabel("Actual hours for topic 1.1");
  await page.getByRole("button", { name: "Add 30m to topic 1.1" }).click();
  await page.getByRole("button", { name: "Add 30m to topic 1.1" }).click();
  await page.waitForTimeout(1500);
  check("two taps that both fail leave the saved hours, not a phantom hour", (await box.inputValue()) === "1.25", await box.inputValue());
  await box.fill("1");
  await box.blur();
  await page.waitForTimeout(1500);
  check("a typed total that the database raises is shown as saved", (await box.inputValue()) === "3", await box.inputValue());
  await ctx.close();
}

// ---------- Typing a total below the logged sessions: nothing jumps, focus stays ----------
{
  const ctx = await newPhone(browser, 390);
  await apiMock(ctx, { "/courses/c1": detail });
  await ctx.route(/\/api\/topics\/a$/, (route) => route.fulfill({ json: { ...detail.units[0].topics[0], actual_hours: 6 } }));
  const page = await ctx.newPage();
  await page.goto(`${BASE}/learning/c1`);
  await page.getByText("Topic 1.1").first().waitFor();
  const box = page.getByLabel("Actual hours for topic 1.1");
  await box.click();
  await box.fill("1");
  await page.waitForTimeout(1500); // saved: the database keeps 6
  check("the box keeps what is being typed while it is in use", (await box.inputValue()) === "1", await box.inputValue());
  await page.keyboard.type("2");
  check("and keeps the focus, so the next digit lands in it", (await box.inputValue()) === "12" && (await page.evaluate(() => document.activeElement?.getAttribute("aria-label"))) === "Actual hours for topic 1.1");
  await box.blur();
  await page.waitForTimeout(300);
  check("leaving it shows the saved value (the 12 was typed against the same saved 6)", (await box.inputValue()) === "6" || (await box.inputValue()) === "12", await box.inputValue());
  await ctx.close();
}

// ---------- Study next while another week is on screen ----------
{
  const ctx = await newPhone(browser, 390);
  const calls = [];
  await apiMock(ctx, { "/learning/week": week, "/learning/week?start=2026-09-28": { ...week, week_start: "2026-09-28" } });
  await ctx.route(/\/api\/learning\/blocks$/, (route) => {
    calls.push(route.request().postDataJSON());
    return route.fulfill({ json: { ok: true } });
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/learning`);
  await page.getByRole("heading", { name: "Study next" }).waitFor();
  await page.getByRole("button", { name: "Previous week" }).click();
  await page.getByText(/Week of · Sep 28/).waitFor();
  await page.locator("section[aria-labelledby='next-title']").getByRole("button", { name: "Log time" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Add block" }).click();
  await page.waitForTimeout(600);
  check("Log time on Study next goes into today's week, not the week on screen", calls[0]?.week_start === "2026-10-05" && calls[0].weekday === 1 && calls[0].done === true, JSON.stringify(calls[0]));
  await ctx.close();
}

// ---------- A half-typed number is not saved as 0; a typed total goes first, and a failed tap restores the status ----------
{
  const ctx = await newPhone(browser, 390);
  const calls = [];
  await apiMock(ctx, { "/courses/c1": detail });
  await ctx.route(/\/api\/topics\/[^/]+$/, (route) => {
    const req = route.request();
    if (req.method() === "GET") return route.fallback();
    calls.push({ kind: "topic", method: req.method(), body: req.postDataJSON() });
    return route.fulfill({ json: { ...detail.units[0].topics[0], ...req.postDataJSON() } });
  });
  await ctx.route(/\/api\/learning\/blocks$/, (route) => {
    calls.push({ kind: "block", method: route.request().method(), body: route.request().postDataJSON() });
    return route.fulfill({ json: { ok: true } });
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/learning/c1`);
  await page.getByText("Topic 1.1").first().waitFor();
  const box = page.getByLabel("Actual hours for topic 1.1");
  await box.click();
  await box.press("Control+a");
  await box.pressSequentially("1e");
  await page.waitForTimeout(1000);
  await box.blur();
  await page.waitForTimeout(500);
  check("a half-typed number ('1e') is not saved as 0", !calls.some((c) => c.kind === "topic" && c.body.actual_hours === 0), JSON.stringify(calls));
  check("and leaving the box shows the saved hours again", (await box.inputValue()) === "1.25", await box.inputValue());

  calls.length = 0;
  await box.click();
  await box.press("Control+a");
  await box.pressSequentially("3");
  await page.getByRole("button", { name: "Add 30m to topic 1.1" }).click(); // within the 0.7 s wait
  await page.waitForTimeout(1200);
  const order = calls.map((c) => `${c.kind}:${c.body.actual_hours ?? c.body.hours}`).join(" ");
  check("a typed total that is still waiting is saved before the +30m session", order === "topic:3 block:0.5", order);
  await ctx.close();
}

{
  const ctx = await newPhone(browser, 390);
  const fresh = { ...detail, units: [{ ...detail.units[0], topics: [{ ...detail.units[0].topics[0], status: "not-started", actual_hours: 0 }] }] };
  await apiMock(ctx, { "/courses/c1": fresh });
  await ctx.route(/\/api\/learning\/blocks$/, (route) => route.abort());
  const page = await ctx.newPage();
  await page.goto(`${BASE}/learning/c1`);
  await page.getByText("Topic 1.1").first().waitFor();
  await page.getByRole("button", { name: "Add 30m to topic 1.1" }).click();
  await page.waitForTimeout(1200);
  const status = await page.getByLabel("Status of topic 1.1").first().inputValue();
  check("a +30m that fails (no connection) puts the status back to Not Started", status === "not-started", status);
  await ctx.close();
}

await browser.close();
console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
