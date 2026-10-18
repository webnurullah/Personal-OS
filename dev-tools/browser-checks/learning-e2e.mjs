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
  check("phone: no hour boxes or planned/spent hours on the topic cards", (await page.getByLabel("Actual hours for topic 1.1").count()) === 0 && (await page.getByText(/^[\d.]+h planned$/).count()) === 0 && (await page.getByRole("button", { name: /Add .* to topic/ }).count()) === 0);
  check("after the end the plan card says Last Week's Plan", (await page.getByText("Last Week's Plan").count()) === 1);
  check("date passed wording on the tile", (await page.getByText("(date passed)").count()) === 1);

  // add topic: next number is 1.4 (1.1 and 1.3 exist), duplicate is warned
  await page.getByRole("button", { name: /Add topic to SEO/ }).click();
  const code = page.locator("#topic-code");
  check("next topic number skips used numbers", (await code.inputValue()) === "1.4", await code.inputValue());
  await code.fill("1.1");
  check("a used number is warned about", (await page.getByText("already used").count()) === 1);
  await page.keyboard.press("Escape");

  // edit topic: the old planned week shows as its dates; unchanged dates are not sent; picked dates are
  await page.getByLabel("Edit topic 1.3").click();
  check("the topic form has From and To dates instead of a week list", (await page.locator("#topic-week").count()) === 0 && (await page.locator("#topic-from").inputValue()) !== "" && (await page.locator("#topic-to").inputValue()) !== "");
  calls.length = 0;
  await page.locator("#topic-title").fill("Renamed topic");
  await page.getByRole("button", { name: "Save topic" }).click();
  await page.waitForTimeout(500);
  const save = calls.find((c) => c.method === "PATCH" && c.url.endsWith("/t3"));
  check("saving without touching the dates does not send them", save && !("plan_start" in save.body) && !("planned_week" in save.body), JSON.stringify(save?.body));
  await page.getByLabel("Edit topic 1.3").click();
  await page.locator("#topic-from").fill("2026-05-04");
  check("picking From fills To with the same day", (await page.locator("#topic-to").inputValue()) !== "");
  await page.locator("#topic-to").fill("2026-05-10");
  calls.length = 0;
  await page.getByRole("button", { name: "Save topic" }).click();
  await page.waitForTimeout(500);
  const picked = calls.find((c) => c.method === "PATCH" && c.url.endsWith("/t3"));
  check("picked dates are sent as plan_start and plan_end", picked?.body?.plan_start === "2026-05-04" && picked?.body?.plan_end === "2026-05-10", JSON.stringify(picked?.body));

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
  check("wide: the table has no hour columns (Estimated, Actual Time Spent, Remaining) and no hour boxes", (await page.locator("table").count()) >= 1 && (await page.getByLabel("Actual hours for topic 1.1").count()) === 0 && (await page.locator("table thead").getByText(/Estimated|Actual Time|Remaining/).count()) === 0 && (await page.locator("table thead").getByText("Status").count()) === 1);
  check("wide: the percentage ring, Module Progress, Weekly Learning Plan and Overall Progress are gone from the course page", (await page.getByText("Module Progress", { exact: true }).count()) === 0 && (await page.getByLabel("Course progress").count()) === 0 && (await page.getByText("Overall Progress", { exact: true }).count()) === 0 && (await page.getByText("Weekly Learning Plan").count()) === 0);
  // The course page: its category, and a status that can be changed with one tap.
  const patches = [];
  await ctx.route(/\/api\/courses\/c1$/, (route) => {
    if (route.request().method() === "PATCH") {
      patches.push(route.request().postDataJSON());
      return route.fulfill({ json: { ok: true } });
    }
    return route.fallback();
  });
  const statusTabs = page.getByRole("tablist", { name: "Course status" });
  check("the course page shows Active / Paused / Done, Active chosen", JSON.stringify(await statusTabs.getByRole("tab").allInnerTexts()) === JSON.stringify(["Active", "Paused", "Done"]) && (await statusTabs.getByRole("tab", { name: "Active" }).getAttribute("aria-selected")) === "true");
  {
    // Top right of the title row: the status, Edit course and Delete sit to the right of the course name, below the breadcrumb.
    const crumb = await page.getByRole("navigation", { name: "Breadcrumb" }).boundingBox();
    const title = await page.locator("h1").boundingBox();
    const st = await statusTabs.boundingBox();
    const edit = await page.getByRole("button", { name: "Edit course" }).boundingBox();
    const del = await page.getByRole("button", { name: "Delete", exact: true }).boundingBox();
    check("wide: the status buttons, Edit course and Delete are at the top right of the title row (right of the course name, below the breadcrumb)", st.y > crumb.y + crumb.height && st.x > title.x + title.width && Math.abs(st.y - title.y) < 60 && edit.x > st.x && del.x > edit.x && del.x + del.width > 1000, JSON.stringify({ crumb, title, st, edit, del }));
    check("and the category badge is not on the course page", (await page.locator("h1").locator("xpath=..").getByText("Digital Marketing", { exact: true }).count()) <= 1);
  }
  await statusTabs.getByRole("tab", { name: "Paused" }).click();
  await page.waitForTimeout(500);
  check("pausing a course saves the status at once", patches.length === 1 && patches[0].status === "paused", JSON.stringify(patches));
  check("and says it is left out of Study next", (await page.getByText(/left out of Study next/).count()) >= 1);
  await ctx.close();
}

// ---------- Learning page on a wide screen: My courses is full width, two courses in a row ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const { session } = await import("/home/user/Personal-OS/dev-tools/browser-checks/audit-lib.mjs");
  await ctx.addCookies([{ name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), url: BASE }]);
  const c = (id, title, over = {}) => ({ id, title, subtitle: "", category: "", status: "active", start_date: "2026-09-14", target_date: "2026-12-31", color: "blue", est_hours: 4, done_hours: 1, spent_hours: 1, percent: 25, topic_count: 2, unit_count: 2, days_left: 80, state: "on-track", behind_hours: 0, weeks_behind: 0, forecast: null, ...over });
  const courseList = [c("c1", "Google Ads", { category: "Digital Marketing", unit_count: 5, units_left: 3, topic_count: 30, topics_left: 16 }), c("c2", "Meta Ads", { category: "Digital marketing", unit_count: 4, units_left: 0, topic_count: 12, topics_left: 1 }), c("c3", "SQL", { category: "Data", unit_count: 0, units_left: 0, topic_count: 0, topics_left: 0 }), c("c4", "English"), c("c5", "Old course", { status: "done", category: "Data" }), c("c6", "Paused course", { status: "paused", category: "Digital Marketing" }), c("c7", "BCS", { status: "done", category: "BCS" })];
  await apiMock(ctx, { "/learning/week": { today: TODAY, week_start: "2026-10-05", topic: "", goal_hours: 6, blocks: [{ id: "b1", week_start: "2026-10-05", weekday: 4, hours: 1, activity: "Google Digital Marketing & E-commerce Certificate", done: false, topic_id: null, resource_id: null }], courses: courseList }, "/courses": { today: TODAY, items: courseList } });
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
  check("wide: only the active courses are listed, two in the first row", links.length === 4 && links[0].top === links[1].top && links[1].left > links[0].left && links[2].top > links[0].top && links[2].top === links[3].top, JSON.stringify(links));
  // How much is left to finish: units and topics.
  const boxOf = (title) => section.locator("li", { hasText: title }).first();
  check("a course box says how many units and topics are left, in the line under its name (not in a line of its own)", (await boxOf("Google Ads").getByText(/^Digital Marketing · 3 of 5 units left · 16 of 30 topics left$/).count()) === 1);
  check("and says when all units are done and one topic is left", (await boxOf("Meta Ads").getByText(/All 4 units done · 1 of 12 topics left$/).count()) === 1);
  check("a course with no units or topics yet says nothing extra (it says 'No time counted yet')", (await boxOf("SQL").getByText("No time counted yet").count()) === 1 && (await boxOf("SQL").getByText("Data · No units yet").count()) === 1 && (await boxOf("SQL").getByText(/ left$/).count()) === 0);
  check("an older answer without the counts shows no 'left' line (English)", (await boxOf("English").getByText(/ left$/).count()) === 0);
  check("wide: both are about the same width (half the width)", Math.abs(links[0].width - links[1].width) <= 2, JSON.stringify(links));
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/learning-wide.png`, fullPage: true });
  // Like a project box: no white card around the boxes, and no archive button on them.
  const outer = await section.evaluate((el) => getComputedStyle(el).backgroundColor);
  check("the boxes sit on the page background (no white card around them)", outer === "rgba(0, 0, 0, 0)", outer);
  check("a course box has no archive button", (await page.getByRole("button", { name: /^Archive / }).count()) === 0);

  // Category and status, like the project list.
  const tabs = async (label) => (await page.getByRole("tablist", { name: label }).getByRole("tab").allInnerTexts()).map((t) => t.trim());
  check("the category tabs are All, then each category in use (spelled the same way once), then Other", JSON.stringify(await tabs("Category")) === JSON.stringify(["All", "Data", "Digital Marketing", "Other"]), JSON.stringify(await tabs("Category")));
  check("the status tabs count every course", JSON.stringify(await tabs("Status")) === JSON.stringify(["Active (4)", "Paused (1)", "Done (2)"]), JSON.stringify(await tabs("Status")));
  // The row under the title: the two sections, the status buttons and the buttons that add, on one line (the new header design).
  const toolbar = async () => {
    const y = async (loc) => Math.round((await loc.boundingBox()).y);
    const x = async (loc) => Math.round((await loc.boundingBox()).x);
    const nav = page.getByRole("navigation", { name: "Learning sections" });
    const status = page.getByRole("tablist", { name: "Status" });
    const add = page.getByRole("button", { name: "Add a course" });
    return { y: [await y(nav), await y(status), await y(add)], x: [await x(nav), await x(status), await x(add)] };
  };
  const row = await toolbar();
  check("the header row has the sections, the status buttons and Add on one line, in that order (no Ideas or Paste a list)", Math.max(...row.y) - Math.min(...row.y) <= 6 && row.x[0] < row.x[1] && row.x[1] < row.x[2] && (await page.getByRole("button", { name: "Ideas" }).count()) === 0 && (await page.getByRole("button", { name: "Paste a list" }).count()) === 0, JSON.stringify(row));
  check("the Focus and Log Study Session buttons are gone from the top right", (await page.getByRole("button", { name: "Focus", exact: true }).count()) === 0 && (await page.getByRole("button", { name: "Log Study Session" }).count()) === 0 && (await page.getByRole("timer").count()) === 0);
  {
    const nav = await page.getByRole("navigation", { name: "Learning sections" }).boundingBox();
    const cat = await page.getByRole("tablist", { name: "Category" }).boundingBox();
    const st = await page.getByRole("tablist", { name: "Status" }).boundingBox();
    check("the category buttons are in the header row, between the sections and the status buttons", Math.abs(cat.y - nav.y) < 12 && cat.x > nav.x + nav.width - 2 && cat.x + cat.width <= st.x + 2, JSON.stringify({ nav, cat, st }));
    check("and are not inside the course boxes area any more", (await section.getByRole("tablist", { name: "Category" }).count()) === 0);
  }
  check("the Study next card and the Learning progress and time card are gone from the Learning page", (await page.getByRole("heading", { name: "Study next" }).count()) === 0 && (await page.getByText("Where the time went").count()) === 0 && (await page.getByText("Learning progress and time").count()) === 0);
  check("the status buttons are not repeated next to the categories", (await page.getByRole("tablist", { name: "Status" }).count()) === 1);
  check("the course boxes have no 'New' button of their own any more", (await section.getByRole("button", { name: "New" }).count()) === 0);
  const titles = async () => (await section.locator("a").evaluateAll((els) => els.map((e) => e.querySelector("span.truncate")?.textContent ?? ""))).sort();
  await page.getByRole("tablist", { name: "Category" }).getByRole("tab", { name: "Digital Marketing" }).click();
  check("a category shows its courses (Google Ads and Meta Ads), with the category on the box", JSON.stringify(await titles()) === JSON.stringify(["Google Ads", "Meta Ads"]) && (await section.getByText(/^Digital Marketing · .*units?/).count()) >= 1, JSON.stringify(await titles()));
  await page.getByRole("tablist", { name: "Status" }).getByRole("tab", { name: /Paused/ }).click();
  check("paused courses of that category", JSON.stringify(await titles()) === JSON.stringify(["Paused course"]));
  check("on Paused, only the categories of paused courses are offered (Data has none paused)", JSON.stringify(await tabs("Category")) === JSON.stringify(["All", "Digital Marketing"]), JSON.stringify(await tabs("Category")));
  await page.getByRole("tablist", { name: "Category" }).getByRole("tab", { name: "All" }).click();
  await page.getByRole("tablist", { name: "Status" }).getByRole("tab", { name: /Done/ }).click();
  check("finished courses are under Done, with the categories they have", JSON.stringify(await titles()) === JSON.stringify(["BCS", "Old course"]) && JSON.stringify(await tabs("Category")) === JSON.stringify(["All", "BCS", "Data"]), JSON.stringify([await titles(), await tabs("Category")]));
  await page.getByRole("tablist", { name: "Category" }).getByRole("tab", { name: "BCS" }).click();
  await page.getByRole("tablist", { name: "Status" }).getByRole("tab", { name: /Active/ }).click();
  check("a category whose only course is Done (BCS) is not offered with the active courses, and the list falls back to All", JSON.stringify(await tabs("Category")) === JSON.stringify(["All", "Data", "Digital Marketing", "Other"]) && (await section.locator("a").count()) === 4, JSON.stringify(await tabs("Category")));
  await page.getByRole("tablist", { name: "Status" }).getByRole("tab", { name: /Done/ }).click();
  await page.getByRole("tablist", { name: "Status" }).getByRole("tab", { name: /Active/ }).click();
  await page.getByRole("tablist", { name: "Category" }).getByRole("tab", { name: "Other" }).click();
  check("courses without a category are under Other", JSON.stringify(await titles()) === JSON.stringify(["English"]));
  await page.getByRole("tablist", { name: "Category" }).getByRole("tab", { name: "All" }).click();

  // The course form: a category (suggestions from the ones in use; a template fills it) and, when editing, a status.
  await page.getByRole("button", { name: "Add a course" }).click();
  const dialog = page.getByRole("dialog");
  const options = await dialog.locator("#course-categories option").evaluateAll((els) => els.map((e) => e.value).sort());
  check("the form suggests the categories already in use", JSON.stringify(options) === JSON.stringify(["BCS", "Data", "Digital Marketing"]), JSON.stringify(options));
  check("a new course has no status field (it starts active)", (await dialog.locator("#course-status").count()) === 0);
  check("Add opens a blank course with the cursor in the name", await dialog.locator("#course-title").evaluate((el) => el === document.activeElement));
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Add a course" }).click();
  await dialog.locator("#course-template").selectOption("digital-marketing");
  check("a template fills the category", (await dialog.locator("#course-category").inputValue()) === "Digital Marketing");
  await dialog.locator("#course-category").fill("Design");
  await dialog.locator("#course-template").selectOption("sql");
  check("a category you typed is kept when another template is picked", (await dialog.locator("#course-category").inputValue()) === "Design");
  await page.keyboard.press("Escape");
  // The week's planned sessions can still be ticked and removed (a closed list under the week in review).
  const details = page.locator("details", { hasText: "Study sessions this week" });
  check("a planned session is listed (closed) so it can still be ticked or removed", (await details.count()) === 1 && (await details.getAttribute("open")) === null);
  await details.locator("summary").click();
  await details.getByLabel(/Done: Friday/).check();
  await page.waitForTimeout(500);
  check("ticking it marks the block done", calls.some((x) => x.method === "PATCH" && x.body.done === true), JSON.stringify(calls));
  await ctx.close();
}

// ---------- Courses with no category yet: no lone "All" button; the status buttons sit in the header row ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const { session } = await import("/home/user/Personal-OS/dev-tools/browser-checks/audit-lib.mjs");
  await ctx.addCookies([{ name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), url: BASE }]);
  const plain = { id: "c1", title: "SQL", subtitle: "", category: "", status: "active", start_date: "2026-09-14", target_date: "2026-12-31", color: "blue", est_hours: 4, done_hours: 1, spent_hours: 1, percent: 25, topic_count: 2, unit_count: 2, days_left: 80, state: "on-track", behind_hours: 0, weeks_behind: 0, forecast: null };
  await apiMock(ctx, { "/learning/week": { today: TODAY, week_start: "2026-10-05", topic: "", goal_hours: 6, blocks: [], courses: [plain] } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/learning`);
  await page.getByRole("heading", { name: "My courses" }).waitFor();
  check("with no categories yet there is no category row (a lone All would do nothing)", (await page.getByRole("tablist", { name: "Category" }).count()) === 0);
  const nav = page.getByRole("navigation", { name: "Learning sections" });
  const stat = page.getByRole("tablist", { name: "Status" });
  const yn = (await nav.boundingBox()).y;
  const ys = (await stat.boundingBox()).y;
  check("the status buttons are on the same line as the sections", Math.abs(yn - ys) < 4, JSON.stringify({ yn, ys }));
  await ctx.close();
}

// ---------- Course page: finishing the last topic marks the course done (the database does it; the page says so) ----------
{
  const ctx = await newPhone(browser, 390);
  const topic = (id, code, over = {}) => ({ id, unit_id: "u1", course_id: "c1", code, title: `Topic ${code}`, short_title: "", outcome: "", est_hours: 2, planned_week: 4, status: "not-started", actual_hours: 0, notes: "", position: 0, ...over });
  let finished = false; // the stand-in database: once the last topic is done, the course is done
  const served = () => ({
    today: TODAY,
    course: { id: "c1", title: "Digital Marketing", subtitle: "", quote: "", category: "", status: finished ? "done" : "active", start_date: "2026-09-14", target_date: "2026-12-06", weekly_plan: [4, 4, 4, 4], color: "blue" },
    units: [{ id: "u1", course_id: "c1", code: "1", title: "SEO", color: "blue", position: 0, topics: [topic("a", "1.1", { status: finished ? "done" : "in-progress", actual_hours: 1 }), topic("b", "1.2", { status: "done", actual_hours: 2 })] }],
  });
  await apiMock(ctx, { "/courses/c1": () => served() });
  await ctx.route(/\/api\/topics\/a$/, (route) => {
    if (route.request().method() === "GET") return route.fallback();
    finished = true;
    return route.fulfill({ json: { ...topic("a", "1.1"), status: "done" } });
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/learning/c1`);
  await page.getByText("Topic 1.1").first().waitFor();
  const statusTabs = page.getByRole("tablist", { name: "Course status" });
  check("an unfinished course is active", (await statusTabs.getByRole("tab", { name: "Active" }).getAttribute("aria-selected")) === "true");
  await page.getByLabel("Status of topic 1.1").first().selectOption("done");
  await page.waitForTimeout(800);
  check("finishing the last topic marks the course done, and the page says so", (await page.getByText(/All topics are finished: the course is marked as done/).count()) >= 1 && (await statusTabs.getByRole("tab", { name: "Done" }).getAttribute("aria-selected")) === "true");
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
  check("the old Learning Progress card (weekly goal, topic, planned blocks) is gone", (await page.getByText("Learning Progress", { exact: true }).count()) === 0 && (await page.getByText("Planned Learning Blocks").count()) === 0 && (await page.getByLabel("Half an hour more").count()) === 0);

  check("the week arrows are gone (the page is always this week)", (await page.getByLabel("Next week").count()) === 0 && (await page.getByText("Week in review").count()) === 0);

  await ctx.close();
}

await browser.close();
console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
