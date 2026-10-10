// Browser check for Learning step 5 (faster setup): paste an outline, plan the weeks, New course from a template, and
// Job Apply's "Course" button. The built app must be running on http://localhost:3123 (see README.md).
// Run:  node plan-e2e.mjs        (a stand-in API answers; nothing real is touched)
import { launch, newPhone, apiMock, measure, BASE, TODAY } from "/home/user/Personal-OS/dev-tools/browser-checks/audit-lib.mjs";

let failures = 0;
const check = (name, ok, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  → " + extra : ""}`);
};

const topic = (id, code, over = {}) => ({ id, unit_id: "u1", course_id: "c1", code, title: `Topic ${code}`, short_title: "", outcome: "", est_hours: 2, planned_week: 4, status: "not-started", actual_hours: 0, notes: "", position: 0, ...over });
const course = { id: "c1", title: "Digital Marketing", subtitle: "", quote: "", start_date: "2026-09-14", target_date: "2026-12-06", weekly_plan: [4, 4, 4, 4], color: "blue" };
const empty = { today: TODAY, course, units: [] };
const full = (over = {}) => ({ today: TODAY, course, units: [{ id: "u1", course_id: "c1", code: "1", title: "SEO", color: "blue", position: 0, topics: [topic("a", "1.1", { planned_week: 4 }), topic("b", "1.2", { planned_week: 5 }), ...(over.late ? [topic("c", "1.3", { planned_week: 1 })] : [])] }] });

const OUTLINE = "Unit 1: SEO basics\n- What is SEO | 1h\n- Keyword research (2.5h)\nUnit 2: Paid ads\n- Google Ads 90m";

const browser = await launch();

async function recordPosts(ctx, pattern, reply) {
  const calls = [];
  await ctx.route(pattern, (route) => {
    const req = route.request();
    if (req.method() === "GET") return route.fallback();
    calls.push({ url: new URL(req.url()).pathname.replace("/api", ""), method: req.method(), body: req.postDataJSON() });
    return route.fulfill({ status: 201, json: typeof reply === "function" ? reply(req) : reply });
  });
  return calls;
}

for (const width of [390, 320]) {
  // ---------- Paste an outline into an empty course ----------
  const ctx = await newPhone(browser, width);
  await apiMock(ctx, { "/courses/c1": empty });
  const calls = await recordPosts(ctx, /\/api\/courses\/c1\/outline$/, { units: 2, topics: 3, hours: 5, warnings: [], plan: { changed: 3, firstWeek: 4, lastWeek: 4, overflow: 0, weeks: 12 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/learning/c1`);
  await page.getByRole("button", { name: "Paste an outline" }).waitFor();
  const m = await measure(page, width);
  check(`${width}px: empty course page does not overflow`, !m.zoomedOut && m.mainClipped === 0 && m.offenders.length === 0, JSON.stringify(m));
  await page.getByRole("button", { name: "Paste an outline" }).click();
  const dialog = page.getByRole("dialog");
  check(`${width}px: nothing read yet before typing, and the add button waits`, (await dialog.getByText("Nothing read yet.").count()) === 1 && (await dialog.getByRole("button", { name: "Add to the course" }).isDisabled()));
  await dialog.getByLabel("Outline").fill(OUTLINE);
  check(`${width}px: the outline is counted as you type`, (await dialog.getByText("2 units · 3 topics · 5h").count()) === 1, await dialog.locator("[aria-live]").textContent());
  check(`${width}px: planning the weeks is on for a course with no plan`, await dialog.getByLabel(/Also plan the weeks/).isChecked());
  const dm = await measure(page, width);
  check(`${width}px: the outline dialog does not overflow`, !dm.zoomedOut && dm.mainClipped === 0 && dm.offenders.length === 0, JSON.stringify(dm));
  if (width === 390) {
    await dialog.locator("#outline-template").selectOption("excel");
    check("a template fills the text box", (await dialog.getByLabel("Outline").inputValue()).startsWith("Unit 1: Getting around"));
    await dialog.getByLabel("Outline").fill(OUTLINE);
    await dialog.getByRole("button", { name: "Add to the course" }).click();
    await page.waitForTimeout(700);
    const post = calls[0];
    check("the outline is sent with plan on and the weekly goal", post?.url === "/courses/c1/outline" && post.body.text === OUTLINE && post.body.plan === true && post.body.weekly_hours === 8, JSON.stringify(post?.body));
    check("it says what was added and planned", (await page.getByText("Added 2 units and 3 topics (5h).").count()) === 1);
  }
  await ctx.close();
}

// ---------- Plan the weeks ----------
{
  const ctx = await newPhone(browser, 390);
  let planned = false;
  await apiMock(ctx, { "/courses/c1": () => { const d = full({ late: true }); return planned ? { ...d, course: { ...d.course, weekly_plan: [0, 0, 0, 7, 3] } } : d; } });
  const calls = await recordPosts(ctx, /\/api\/courses\/c1\/plan$/, () => { planned = true; return { changed: 3, firstWeek: 4, lastWeek: 6, overflow: 2, weeks: 12 }; });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/learning/c1`);
  await page.getByRole("button", { name: "Plan weeks" }).click();
  const dialog = page.getByRole("dialog");
  check("the dialog says what is left and the pace that finishes on time", (await dialog.getByText(/6h left to study and 9 weeks to the target date: about 40m a week/).count()) === 1, await dialog.locator("p").first().textContent());
  check("the weekly hours start at the weekly goal", (await dialog.locator("#plan-hours").inputValue()) === "8");
  check("late topics can be carried over", (await dialog.getByRole("button", { name: /Carry over 1 late topic/ }).isEnabled()));
  await dialog.locator("#plan-hours").fill("4");
  await dialog.getByRole("button", { name: "Plan the rest of the course" }).click();
  await page.waitForTimeout(700);
  check("planning sends the mode and the weekly hours", calls[0]?.body?.mode === "plan" && calls[0].body.weekly_hours === 4, JSON.stringify(calls[0]?.body));
  check("it says what was planned and warns about hours that do not fit", (await page.getByText("Planned 3 topics for weeks 4–6.").count()) === 1 && (await page.getByText(/2h do not fit before the target date/).count()) === 1);
  check("the Planned Hours boxes show the new plan", (await page.getByLabel("Planned hours for week 4", { exact: true }).inputValue()) === "7" && (await page.getByLabel("Planned hours for week 1", { exact: true }).inputValue()) === "", `${await page.getByLabel("Planned hours for week 4", { exact: true }).inputValue()} / ${await page.getByLabel("Planned hours for week 1", { exact: true }).inputValue()}`);
  await page.getByRole("button", { name: "Plan weeks" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Carry over/ }).click();
  await page.waitForTimeout(700);
  check("carrying over sends only the mode", calls[1]?.body?.mode === "carry" && !("weekly_hours" in calls[1].body), JSON.stringify(calls[1]?.body));
  await ctx.close();

  const ctx2 = await newPhone(browser, 390);
  await apiMock(ctx2, { "/courses/c1": full() });
  const page2 = await ctx2.newPage();
  await page2.goto(`${BASE}/learning/c1`);
  await page2.getByRole("button", { name: "Plan weeks" }).click();
  check("with no late topic the carry-over button says so and is off", await page2.getByRole("dialog").getByRole("button", { name: "No late topics" }).isDisabled());
  await ctx2.close();
}

// ---------- New course from a template ----------
{
  const ctx = await newPhone(browser, 390);
  await apiMock(ctx, {
    "/learning/week": { today: TODAY, week_start: "2026-10-05", topic: "", goal_hours: 8, blocks: [], courses: [], study_next: [], open_topics: [], library: [], stats: { streak: 0, weeks: [] } },
  });
  const created = await recordPosts(ctx, /\/api\/courses(\/new1\/outline)?$/, (req) => (req.url().endsWith("/outline") ? { units: 6, topics: 15, hours: 38, warnings: [], plan: null } : { id: "new1" }));
  const page = await ctx.newPage();
  await page.goto(`${BASE}/learning`);
  await page.getByRole("button", { name: "Add a course" }).click();
  const dialog = page.getByRole("dialog");
  const target = dialog.locator("#course-target");
  const before = await target.inputValue();
  await dialog.locator("#course-template").selectOption("excel");
  check("a template fills the name and the subtitle", (await dialog.locator("#course-title").inputValue()) === "Excel for work" && (await dialog.locator("#course-subtitle").inputValue()) === "Spreadsheets you can use at a job");
  check("and the target date follows its weeks at your weekly goal", (await target.inputValue()) !== before && (await dialog.getByText(/weeks at your goal of 8h a week/).count()) === 1, `${before} → ${await target.inputValue()}`);
  check("and the outline is in the box", (await dialog.locator("#course-outline").inputValue()).includes("VLOOKUP"));
  const m = await measure(page, 390);
  check("the New course dialog does not overflow", !m.zoomedOut && m.mainClipped === 0 && m.offenders.length === 0, JSON.stringify(m));
  // Another template replaces what the first one filled in; words you typed yourself stay.
  await dialog.locator("#course-template").selectOption("web-wordpress");
  check("another template changes the name and the subtitle too", (await dialog.locator("#course-title").inputValue()) === "Web basics and WordPress" && (await dialog.locator("#course-subtitle").inputValue()) === "Build and publish a real website");
  await dialog.locator("#course-template").selectOption("");
  check("a blank course clears what the template filled in", (await dialog.locator("#course-title").inputValue()) === "" && (await dialog.locator("#course-outline").inputValue()) === "");
  await dialog.locator("#course-title").fill("My own name");
  await dialog.locator("#course-template").selectOption("excel");
  check("a name you typed yourself is kept", (await dialog.locator("#course-title").inputValue()) === "My own name" && (await dialog.locator("#course-subtitle").inputValue()) === "Spreadsheets you can use at a job");
  await dialog.locator("#course-title").fill("Excel for work");
  await target.fill("2027-03-01");
  await dialog.locator("#course-start").fill("2026-10-05");
  check("a date you chose yourself is kept", (await target.inputValue()) === "2027-03-01");
  await dialog.getByRole("button", { name: "Create course" }).click();
  await page.waitForTimeout(900);
  const course = created.find((c) => c.url === "/courses");
  const outline = created.find((c) => c.url === "/courses/new1/outline");
  check("the course is created with the chosen dates", course?.body?.title === "Excel for work" && course.body.target_date === "2027-03-01" && course.body.start_date === "2026-10-05", JSON.stringify(course?.body));
  check("then its outline is added with the weeks planned", outline?.body?.plan === true && outline.body.text.includes("Unit 1: Getting around") && outline.body.weekly_hours === 8, JSON.stringify(outline?.body).slice(0, 200));
  await ctx.close();
}

// ---------- Job Apply: a course for a missing skill ----------
{
  const ctx = await newPhone(browser, 390);
  const job = { id: "j1", url: "https://example.com/j1", title: "Data analyst " + "x".repeat(260).slice(0, 190), company: "Acme", location: "Dhaka", deadline: "2026-10-30", status: "saved", applied_on: null, summary: "", requirements: [], skills: ["SQL"], notes: "", created_at: "2026-10-01T00:00:00Z" };
  await apiMock(ctx, { "/jobs": { items: [job], today: TODAY } });
  const calls = await recordPosts(ctx, /\/api\/courses\/from-skill$/, { id: "c9", existing: false, plan: { overflow: 0 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/jobs`);
  await page.getByRole("heading", { name: "Skills to learn" }).waitFor();
  const m = await measure(page, 390);
  check("Job Apply does not overflow with the extra button", !m.zoomedOut && m.mainClipped === 0, JSON.stringify(m));
  await page.getByRole("button", { name: "Course", exact: true }).click();
  await page.waitForTimeout(700);
  check("Course sends the skill, the jobs and the nearest last date", calls[0]?.body?.skill === "SQL" && calls[0].body.by === "2026-10-30" && calls[0].body.jobs?.[0]?.length <= 200 && calls[0].body.jobs[0].startsWith("Data analyst"), JSON.stringify(calls[0]?.body));
  check("then it offers to open the course", (await page.getByRole("link", { name: "Open course" }).getAttribute("href")) === "/learning/c9");
  await ctx.close();
}

await browser.close();
console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
