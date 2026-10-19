// Browser check for the course page header and the course timer: This Week's Plan, Time spent (Start / Pause / Continue) and Target Date
// side by side where the three hour tiles were; no hour tiles or Estimated hours field; the course shows on Habits next to projects.
// The built app must be running on http://localhost:3123.   Run:  node course-time-e2e.mjs   (SHOTS=<folder> saves pictures)
import { launch, newPhone, apiMock, measure, BASE, TODAY, session } from "/home/user/Personal-OS/dev-tools/browser-checks/audit-lib.mjs";
import { endFor, projectState, summariseTime } from "/home/user/Personal-OS/web/lib/project-time.ts";

let failures = 0;
const check = (name, ok, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  → " + extra : ""}`);
};

const topic = (id, code, over = {}) => ({ id, unit_id: "u1", course_id: "c1", code, title: `Topic ${code}`, short_title: "", outcome: "", est_hours: 2, planned_week: 4, status: "not-started", actual_hours: 0, notes: "", position: 0, ...over });
const detail = {
  today: TODAY,
  course: { id: "c1", title: "Digital Marketing", subtitle: "", quote: "", category: "Marketing", status: "active", start_date: "2026-10-01", target_date: "2026-12-31", weekly_plan: [4, 4, 4, 4], color: "blue" },
  units: [{ id: "u1", course_id: "c1", code: "1", title: "SEO", color: "blue", position: 0, topics: [topic("a", "1.1", { planned_week: 1 }), topic("b", "1.2", { status: "done", actual_hours: 2, planned_week: 1 })] }],
};
const REAL = new Date().toISOString().slice(0, 10);
const browser = await launch();

for (const width of [390, 320, 1280]) {
  const wide = width >= 1000;
  const ctx = wide ? await browser.newContext({ viewport: { width, height: 900 } }) : await newPhone(browser, width);
  if (wide) await ctx.addCookies([{ name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), url: BASE }]);
  const rows = { project: [{ project_id: "p1", started_at: new Date(Date.now() - 3600000).toISOString(), ended_at: null }], course: [] };
  const names = { p1: "CRM", c1: "Digital Marketing" };
  const stateFor = (kind, id) => {
    // Several timers can run at once: a page only knows its own running timer.
    const running = rows[kind].find((r) => !r.ended_at && r.project_id === id);
    const own = rows[kind].filter((r) => r.project_id === id && r.ended_at);
    return projectState(running ? [...own, running] : own, id, running ? names[running.project_id] : "", REAL, "UTC", Date.now(), kind);
  };
  const stopAll = () => {
    for (const k of ["project", "course"]) for (const r of rows[k]) if (!r.ended_at) r.ended_at = endFor(r.started_at, Date.now());
  };
  await apiMock(ctx, {
    "/courses/c1": detail,
    "/habits?days=7": { today: TODAY, days: ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06"], items: [], heatmap: [], summary: { total: 0, done_today: 0, best: { days: 0, name: "" }, share: 0, perfect_days: 0, most_consistent: null, needs_attention: null } },
    "/project-time?days=7": () => summariseTime([...rows.project, ...rows.course], [{ id: "p1", name: "CRM", color: "amber", kind: "project" }, { id: "c1", name: "Digital Marketing", color: "blue", kind: "course" }], REAL, "UTC", 7, Date.now()),
  });
  await ctx.route("**/api/courses/c1/time", async (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      const { action } = JSON.parse(req.postData() ?? "{}");
      const here = rows.course.find((r) => !r.ended_at);
      if (action === "start" && !here) {
        rows.course.push({ project_id: "c1", started_at: new Date().toISOString(), ended_at: null });
      } else if (action === "pause" && here) here.ended_at = endFor(here.started_at, Date.now());
    }
    await route.fulfill({ json: stateFor("course", "c1") });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/learning/c1`);
  const timer = page.getByRole("timer", { name: "Time spent on this course" });
  await timer.waitFor();
  await page.getByText("This Week's Plan", { exact: false }).first().waitFor();

  // ---- the header: the hour tiles are gone, the three boxes are there
  check(`${width}px: no Total Learning Time / Time Completed / Time Remaining tiles`, (await page.getByText("Total Learning Time").count()) === 0 && (await page.getByText("Time Completed").count()) === 0 && (await page.getByText("Time Remaining").count()) === 0);
  const week = await page.locator("section[aria-labelledby='week-title']").boundingBox();
  const box = await timer.locator("xpath=ancestor::section").boundingBox();
  const target = await page.getByText("Target Date", { exact: true }).locator("xpath=ancestor::div[contains(@class,'card')][1]").boundingBox();
  check(`${width}px: This Week's Plan, Time spent and Target Date are three boxes in one block`, !!week && !!box && !!target && (wide ? Math.abs(week.y - box.y) < 8 && week.x < box.x && box.x < target.x : week.y < box.y && box.y < target.y), JSON.stringify({ week, box, target }));
  check(`${width}px: the Estimated hours field is gone from the topic form`, await (async () => { await page.getByLabel("Edit topic 1.1").click(); const gone = (await page.locator("#topic-est").count()) === 0 && (await page.locator("#topic-from").count()) === 1 && (await page.locator("#topic-week").count()) === 0; await page.keyboard.press("Escape"); return gone; })());
  let m = await measure(page, width);
  check(`${width}px: the course page fits the screen`, !m.zoomedOut && m.mainClipped === 0 && m.offenders.length === 0, JSON.stringify(m));
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/course-time-${width}.png`, fullPage: true });

  // ---- the timer: a project timer is running, and a course timer runs next to it
  await page.getByRole("button", { name: "Start" }).waitFor();
  check(`${width}px: no "running elsewhere" notice, and it shows 0:00:00`, (await page.getByText(/The timer is running on/).count()) === 0 && (await timer.innerText()).trim() === "0:00:00");
  await page.getByRole("button", { name: "Start" }).click();
  await page.getByRole("button", { name: "Pause" }).waitFor();
  check(`${width}px: Start starts this course and leaves the project timer running`, rows.project.every((r) => !r.ended_at) && rows.course.filter((r) => !r.ended_at).length === 1);
  await page.waitForFunction(() => /^0:00:0[1-9]$/.test(document.querySelector("[role=timer]")?.textContent?.trim() ?? ""), null, { timeout: 8000 }).catch(() => undefined);
  check(`${width}px: the clock counts up`, /^0:00:0[1-9]$/.test((await timer.innerText()).trim()), (await timer.innerText()).trim());
  await page.getByRole("button", { name: "Pause" }).click();
  await page.getByRole("button", { name: "Continue" }).waitFor();
  check(`${width}px: Pause keeps the time (the button says Continue)`, rows.course.every((r) => r.ended_at) && (await timer.innerText()).trim() !== "0:00:00");

  // ---- Habits shows the course next to the projects
  await page.goto(`${BASE}/habits`);
  const card = page.locator("section", { has: page.getByRole("heading", { name: "Project & course time" }) });
  await card.waitFor();
  check(`${width}px: Habits lists the course (with a Course tag) and the project`, (await card.getByRole("link", { name: /Digital Marketing/ }).count()) >= 1 && (await card.getByText("Course", { exact: true }).count()) === 1 && (await card.getByRole("link", { name: /CRM/ }).count()) >= 1);
  check(`${width}px: the course link opens the course page`, (await card.getByRole("link", { name: /Digital Marketing/ }).first().getAttribute("href")) === "/learning/c1");
  m = await measure(page, width);
  check(`${width}px: Habits fits the screen`, !m.zoomedOut && m.mainClipped === 0 && m.offenders.length === 0, JSON.stringify(m));
  check(`${width}px: no page errors`, errors.length === 0, errors.join("; "));
  await ctx.close();
}
await browser.close();
console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
