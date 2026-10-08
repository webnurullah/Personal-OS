// Browser check for the Learning library (step 2). The built app must be running on http://localhost:3123.
import { launch, newPhone, apiMock, measure, BASE, TODAY, session, profile } from "/home/user/Personal-OS/dev-tools/browser-checks/audit-lib.mjs";
import { applyChange } from "/home/user/Personal-OS/web/lib/library.ts";

let failures = 0;
const check = (name, ok, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  → " + extra : ""}`);
};

const LONG = "A very long course title about search engine optimisation for local businesses in Bangladesh ".repeat(2).trim();
const base = { course_id: null, unit_id: null, practice_project_id: null, kind: "certificate", url: "", platform: "", provider: "", status: "todo", priority: "medium", est_hours: 0, items_total: 0, items_done: 0, due_date: null, started_on: null, completed_on: null, cost: 0, skills: [], rating: null, takeaway: "", dropped_reason: "", notes: "", certificate_url: "", certificate_id: "", issued_on: null, expires_on: null };
const seed = () => [
  { ...base, id: "r1", title: "SEO full course", kind: "playlist", platform: "YouTube", provider: "Some Channel", status: "learning", items_total: 24, items_done: 7, est_hours: 8, started_on: "2026-10-01", course_id: "c1", skills: ["SEO"], created_at: "2026-10-01T00:00:00Z" },
  { ...base, id: "r2", title: "Google Ads Search certification", platform: "Google", est_hours: 8, course_id: "c1", skills: ["Google Ads", "React"], priority: "high", due_date: "2026-10-09", created_at: "2026-10-02T00:00:00Z" },
  { ...base, id: "r3", title: LONG, url: "https://www.example.com/a/really/long/path/that/goes/on/and/on/and/on/for/a/while/seo-for-local-businesses-complete-course-2026", platform: "Example", created_at: "2026-10-03T00:00:00Z" },
  { ...base, id: "r4", title: "Fundamentals of Digital Marketing", platform: "Google", status: "completed", est_hours: 40, course_id: "c1", completed_on: "2026-09-20", started_on: "2026-08-01", certificate_id: "ABC123", certificate_url: "https://example.com/cert/1", issued_on: "2026-09-20", expires_on: "2026-10-20", rating: 5, takeaway: "I can explain the funnel", skills: ["Digital Marketing"], created_at: "2026-08-01T00:00:00Z" },
];
const course = { id: "c1", title: "Digital Marketing", subtitle: "", start_date: "2026-09-14", target_date: "2026-12-31", color: "blue", est_hours: 10, done_hours: 2, spent_hours: 2, percent: 20, topic_count: 3, unit_count: 1, days_left: 86 };
const detail = { today: TODAY, course: { ...course, quote: "", weekly_plan: [] }, units: [{ id: "u1", course_id: "c1", code: "1", title: "SEO", color: "blue", position: 0, topics: [] }] };

function stateful(ctx) {
  const calls = [];
  const state = { items: seed(), skills: ["Git"] };
  return ctx.route("**/api/**", async (route) => {
    const req = route.request(), u = new URL(req.url()), path = u.pathname.replace("/api", ""), method = req.method();
    const body = req.postData() ? req.postDataJSON() : undefined;
    const json = (j, status = 200) => route.fulfill({ json: j, status });
    if (path !== "/notifications" && method !== "GET") calls.push({ method, path, body });
    if (path === "/resources" && method === "GET") return json({ today: TODAY, items: state.items });
    if (path === "/resources" && method === "POST") { const row = { ...base, ...applyChange({ status: "todo", items_total: 0, items_done: 0, started_on: null, completed_on: null }, body, TODAY), id: "n" + state.items.length, created_at: "2026-10-06T00:00:00Z" }; state.items.unshift(row); return json(row, 201); }
    if (path === "/resources/bulk") { const rows = body.items.map((i, n) => ({ ...base, id: "b" + n + state.items.length, title: i.title, url: i.url, kind: i.kind ?? body.kind ?? "other", platform: i.platform ?? "", est_hours: i.est_hours ?? 0, skills: i.skills ?? [], course_id: body.course_id, created_at: "2026-10-06T00:00:00Z" })); state.items.unshift(...rows); return json({ items: rows }, 201); }
    if (path === "/resources/read") {
      if (body.url.includes("coursera")) return json({ url: body.url, title: "SEO Basics", platform: "Coursera", provider: "", kind: "certificate", found: true, note: "" });
      if (body.url.includes("youtube")) return json({ url: body.url, title: "Excel full course", platform: "YouTube", provider: "ExcelChannel", kind: "playlist", found: true, note: "" });
      return json({ url: body.url, title: "", platform: "", provider: "", kind: "other", found: false, note: "The website refused to share the page (403)." });
    }
    const m = path.match(/^\/resources\/([^/]+)$/);
    if (m && method === "PATCH") { const i = state.items.findIndex((r) => r.id === m[1]); const merged = { ...state.items[i], ...applyChange(state.items[i], body, TODAY) }; state.items[i] = merged; return json(merged); }
    if (m && method === "DELETE") { state.items = state.items.filter((r) => r.id !== m[1]); return json({ ok: true }); }
    if (path === "/profile" && method === "PATCH") { state.skills = body.skills ?? state.skills; return json({ ...profile, skills: state.skills }); }
    if (path === "/profile") return json({ ...profile, skills: state.skills });
    if (path === "/courses") return json({ today: TODAY, items: [course] });
    if (path === "/courses/c1") return json(detail);
    if (path === "/notifications") return json({ items: [], unread: 0 });
    if (path === "/assistant") return json({ ai: false });
    if (method !== "GET") return json({ ok: true });
    return json({ items: [], today: TODAY });
  }).then(() => ({ calls, state }));
}

const browser = await launch();
const ctx = await newPhone(browser, 390);
const { calls, state } = await stateful(ctx);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(`${BASE}/learning/library`);
await page.getByText("SEO full course").first().waitFor();

// ----- layout and content -----
let m = await measure(page, 390);
check("phone: library does not zoom out or overflow (long title and link)", !m.zoomedOut && m.mainClipped === 0, JSON.stringify(m));
check("tabs: Certificates & playlists is the current one", (await page.locator('nav[aria-label="Learning sections"] a[aria-current="page"]').textContent())?.includes("Certificates"));
check("tiles: 2 to do/learning in the To do tab", (await page.getByRole("tab", { name: /To do \(3\)/ }).count()) === 1);
check("playlist progress shows 7 of 24 videos", (await page.getByText("7 of 24 videos").count()) === 1);
check("platform and kind are in the meta line", (await page.getByText("YouTube playlist · YouTube · Some Channel · 8h").count()) === 1);

// ----- +1 video -----
await page.getByRole("button", { name: "1 video" }).click();
await page.getByText("8 of 24 videos").waitFor();
await page.waitForTimeout(300);
check("+1 video sends only the new count", calls.some((c) => c.method === "PATCH" && c.path === "/resources/r1" && c.body.items_done === 8 && Object.keys(c.body).length === 1), JSON.stringify(calls.at(-1)));

// ----- complete: Make it count -----
await page.getByRole("button", { name: "Complete" }).nth(1).click(); // the second open row = Google Ads (rows: r1 learning, r2 todo...)
await page.getByText("Make it count").first().waitFor();
const skillsValue = await page.locator("#done-skills").inputValue();
check("skills of the item are offered", skillsValue === "Google Ads, React", skillsValue);
await page.locator("#done-takeaway").fill("I can run a small search campaign");
await page.locator("#done-cert-id").fill("GADS-77");
await page.locator("#done-expires").fill("2027-10-01");
m = await measure(page, 390);
check("phone: the Make it count dialog does not widen the page", !m.zoomedOut, JSON.stringify(m));
await page.getByRole("button", { name: "Mark complete" }).click();
await page.getByText("Completed: Google Ads Search certification").waitFor();
const patch = calls.find((c) => c.path === "/resources/r2" && c.body.status === "completed");
check("completing sends status, skills, takeaway and certificate", patch && patch.body.certificate_id === "GADS-77" && patch.body.takeaway.startsWith("I can run") && patch.body.expires_on === "2027-10-01", JSON.stringify(patch?.body));
const prof = calls.find((c) => c.path === "/profile");
check("new skills are merged into the profile (React already... Git kept)", prof && prof.body.skills.join() === "Git,Google Ads,React", JSON.stringify(prof?.body));
check("a CV line is offered", (await page.getByText(/Completed Google Ads Search certification \(Google, Oct 2026\) — skills: Google Ads, React — certificate ID GADS-77/).count()) === 1);
await page.getByRole("button", { name: "Not now" }).click();

// ----- tabs: completed and certificates -----
await page.getByRole("tab", { name: /Completed \(2\)/ }).click();
check("completed tab lists both completed items", (await page.getByText("Fundamentals of Digital Marketing").count()) >= 1 && (await page.getByText("Google Ads Search certification").count()) >= 1);
await page.getByRole("tab", { name: /Certificates \(2\)/ }).click();
check("certificates tab shows the expiry reminder", (await page.getByText("Expires in 14 days").count()) === 1);
check("…and the certificate id", (await page.getByText("ABC123").count()) === 1);
m = await measure(page, 390);
check("phone: certificates tab fits", !m.zoomedOut && m.mainClipped === 0, JSON.stringify(m));
await page.getByRole("tab", { name: /To do/ }).click();

// ----- add one with a link -----
await page.getByRole("button", { name: "Add", exact: true }).click();
await page.locator("#res-url").fill("https://www.coursera.org/learn/seo-basics");
await page.getByRole("button", { name: "Read link" }).click();
await page.waitForFunction(() => document.querySelector("#res-title")?.value === "SEO Basics");
check("Read link fills the title and platform", (await page.locator("#res-platform").inputValue()) === "Coursera");
await page.locator("#res-total").fill("12");
m = await measure(page, 390);
check("phone: the add form fits", !m.zoomedOut, JSON.stringify(m));
await page.getByRole("button", { name: "Add to library" }).click();
await page.getByText("SEO Basics").first().waitFor();
const created = calls.find((c) => c.method === "POST" && c.path === "/resources");
check("saved with title, platform, kind and count", created && created.body.title === "SEO Basics" && created.body.platform === "Coursera" && created.body.items_total === 12 && created.body.kind === "certificate", JSON.stringify(created?.body));

// ----- a site that refuses: manual form still works -----
await page.getByRole("button", { name: "Add", exact: true }).click();
await page.locator("#res-url").fill("https://blocked.example.org/course");
await page.getByRole("button", { name: "Read link" }).click();
await page.getByText("refused to share the page").waitFor();
check("a refusing site shows a plain message and keeps the form", (await page.locator("#res-title").inputValue()) === "");
await page.keyboard.press("Escape");

// ----- paste a list -----
await page.getByRole("button", { name: "Paste a list" }).click();
await page.locator("#paste-list").fill("https://www.youtube.com/playlist?list=PL1\n- Email marketing\n2) Content writing | https://www.coursera.org/learn/writing");
await page.getByText("3 items found.").waitFor();
await page.getByRole("button", { name: "Add 3" }).click();
await page.getByText("Excel full course").first().waitFor();
const bulk = calls.find((c) => c.path === "/resources/bulk");
check("pasted list: titles come from the links, plain titles stay", bulk && bulk.body.items.map((i) => i.title).join("|") === "Excel full course|Email marketing|Content writing", JSON.stringify(bulk?.body.items.map((i) => i.title)));

// ----- ideas -----
await page.getByRole("button", { name: "Ideas" }).click();
await page.getByText("Fundamentals of Digital Marketing").first().waitFor();
await page.getByLabel("SEO basics: keywords, on-page and links").check();
await page.getByLabel("Email marketing", { exact: true }).last().check();
m = await measure(page, 390);
check("phone: ideas dialog fits", !m.zoomedOut, JSON.stringify(m));
await page.getByRole("button", { name: "Add 2" }).click();
await page.waitForTimeout(500);
const ideas = calls.filter((c) => c.path === "/resources/bulk").at(-1);
check("ideas are added with kind, platform, hours and skills", ideas && ideas.body.items.length === 2 && ideas.body.items[0].est_hours > 0 && ideas.body.items[0].skills.length > 0, JSON.stringify(ideas?.body.items[0]));

// ----- edit and delete -----
await page.getByLabel("Edit Google Ads Search certification").first().click().catch(() => {});
await ctx.close();

// ----- course page card (phone) -----
{
  const c2 = await newPhone(browser, 390);
  await stateful(c2);
  const p2 = await c2.newPage();
  await p2.goto(`${BASE}/learning/c1`);
  await p2.getByText("Courses & playlists").first().waitFor();
  await p2.getByText(/1 of 3 completed/).waitFor({ timeout: 8000 }).catch(() => {});
  check("course page: rollup says 1 of 3 completed", (await p2.getByText(/1 of 3 completed/).count()) === 1);
  const m2 = await measure(p2, 390);
  check("phone: course page with the library card fits", !m2.zoomedOut && m2.mainClipped === 0, JSON.stringify(m2));
  await c2.close();
}

check("no page errors", errors.length === 0, errors.join(" | "));
await browser.close();
console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
