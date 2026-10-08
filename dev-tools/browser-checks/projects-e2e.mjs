import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import { summarise, timeframe, progress } from "/home/user/Personal-OS/web/lib/projects.ts";
const base = "http://localhost:3123", S = process.argv[2];
const T = "2026-10-06";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const now = Math.floor(Date.now() / 1000);
const session = { access_token: "x.y.z", refresh_token: "r", token_type: "bearer", expires_in: 99999999, expires_at: now + 99999999, user: { id: "u1", aud: "authenticated", email: "me@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
await ctx.addCookies([{ name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), url: base }]);

// ---- a small stand-in for the API, with real state
const uid = () => crypto.randomUUID();
const proj = (over) => ({ id: uid(), name: "x", kind: "website", status: "active", color: "blue", client: "", goal: "", start_date: null, due_date: null, links: [], notes: "", archived_at: null, created_at: "2026-09-01T10:00:00Z", ...over });
const task = (over) => ({ id: uid(), title: "t", notes: "", priority: "medium", due_date: null, end_date: null, done_at: null, category_id: null, project_id: null, created_at: T, ...over });
const bakery = proj({ id: "11111111-1111-4111-8111-111111111111", name: "Rahim's bakery website", client: "Rahim", goal: "Launch before Eid", due_date: "2026-10-09", start_date: "2026-09-20", color: "amber", links: [{ label: "Staging", url: "https://staging.example.com" }, { label: "Bad", url: "javascript:alert(1)" }], notes: "Needs a menu page." });
const fb = proj({ id: "22222222-2222-4222-8222-222222222222", name: "My Facebook page routine", kind: "social", color: "blue", goal: "Post 4 times a week", created_at: "2026-09-01T10:00:00Z" });
const old = proj({ id: "33333333-3333-4333-8333-333333333333", name: "Old portfolio", status: "done", color: "slate", due_date: "2026-08-01" });
const db = { projects: [bakery, fb, old], tasks: [
  task({ id: "a1", title: "Design home page", project_id: bakery.id, done_at: "2026-10-02T00:00:00Z" }),
  task({ id: "a2", title: "Build menu page", project_id: bakery.id, due_date: "2026-10-08" }),
  task({ id: "a3", title: "Connect domain", project_id: bakery.id }),
  task({ id: "a4", title: "Write about page", project_id: bakery.id }),
  task({ id: "b1", title: "Plan this week's posts", project_id: fb.id }),
  task({ id: "c1", title: "Buy milk" }),
] };
const writes = [];
const profile = { id: "u1", email: "me@example.com", today: T, full_name: "Nurullah", currency: "BDT", time_format: "12h", timezone: "Asia/Dhaka", week_start: 1, hide_amounts: false, skills: [], notify: {} };
const full = (p) => { const s = summarise([p], db.tasks, T)[0]; return s; };
await ctx.route("**/api/**", async (route) => {
  const req = route.request(), u = new URL(req.url()), path = u.pathname.replace("/api", ""), p = path + u.search, m = req.method();
  const body = req.postData() ? JSON.parse(req.postData()) : undefined;
  const ok = (json, status = 200) => route.fulfill({ status, json });
  if (m !== "GET") writes.push({ m, p, body });
  if (p === "/assistant") return ok({ ai: false });
  if (p === "/profile") return ok(profile);
  if (p === "/projects?lite=1") return ok({ items: db.projects.map(({ id, name, color, status, archived_at }) => ({ id, name, color, status, archived_at })) });
  if ((p === "/projects" || p === "/projects?archived=1") && m === "GET") { const wantArchived = p.endsWith("archived=1"); return ok({ today: T, items: summarise(db.projects.filter((x) => Boolean(x.archived_at) === wantArchived).map(({ links, notes, ...rest }) => rest), db.tasks, T) }); }
  if (p === "/archive" && m === "GET") return ok({ today: T, items: db.projects.filter((x) => x.archived_at).map((x) => ({ id: x.id, source: "project", kind: "project", title: x.name, detail: "Website", related: db.tasks.filter((t) => t.project_id === x.id).length, deleted_at: x.archived_at, deleted_on: x.archived_at.slice(0, 10), color: x.color })) });
  if (p === "/projects" && m === "POST") { const created = proj({ kind: "other", ...body, created_at: T + "T05:00:00Z" }); db.projects.push(created); return ok(created, 201); }
  const pm = path.match(/^\/projects\/([^/]+)$/);
  if (pm) {
    const found = db.projects.find((x) => x.id === pm[1]);
    if (!found) return ok({ error: { message: "Not found." } }, 404);
    if (m === "GET") { const tasks = db.tasks.filter((t) => t.project_id === found.id); const s = full(found); return ok({ today: T, project: { ...s, links: found.links, notes: found.notes }, tasks }); }
    if (m === "PATCH") { const { archived, ...rest } = body; Object.assign(found, rest); if (archived !== undefined) found.archived_at = archived ? new Date().toISOString() : null; return ok(found); }
    if (m === "DELETE") { if (!found.archived_at) return ok({ error: { message: "Archive the project first, then delete it from the Archive." } }, 400); db.projects = db.projects.filter((x) => x !== found); db.tasks = db.tasks.filter((t) => t.project_id !== found.id); return ok({ ok: true }); }
  }
  if (p === "/tasks" && m === "GET") return ok({ today: T, items: db.tasks });
  if (p === "/tasks" && m === "POST") { const created = task({ ...body }); db.tasks.push(created); return ok(created, 201); }
  const tm = path.match(/^\/tasks\/([^/]+)$/);
  if (tm && m === "PATCH") { const found = db.tasks.find((x) => x.id === tm[1]); const { done, ...rest } = body; Object.assign(found, rest); if (done !== undefined) found.done_at = done ? new Date().toISOString() : null; return ok(found); }
  if (p.startsWith("/events")) return ok({ today: T, from: T, to: T, items: [], deadlines: [], project_dates: db.projects.filter((x) => x.status === "active" && x.due_date && !x.archived_at).map((x) => ({ id: `project-${x.id}`, project_id: x.id, title: x.name, kind: "deadline", date: x.due_date, color: x.color })) });
  if (p === "/notifications") return ok({ items: db.projects.filter((x) => x.status === "active" && x.due_date && x.due_date <= "2026-10-09").map((x) => ({ id: `project-${x.id}`, icon: "briefcase", tone: "amber", title: `${x.name} is due in 3 days`, meta: "Projects", href: `/projects/${x.id}` })), unread: 1 });
  if (p === "/categories") return ok({ items: [{ id: "cat1", name: "Personal", color: "blue", position: 0 }] });
  return ok({ items: [], today: T });
});

const page = await ctx.newPage();
const errors = []; page.on("pageerror", (e) => errors.push("PAGE " + e)); page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push("CONSOLE " + m.text()));
const check = (name, cond, extra = "") => console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  → " + extra : ""}`);
const lastWrite = (m, re) => [...writes].reverse().find((w) => w.m === m && re.test(w.p));

// 1. list
await page.goto(base + "/projects");
await page.getByText("Rahim's bakery website").first().waitFor();
await page.waitForTimeout(500);
await page.screenshot({ path: S + "/pr-list.png", fullPage: true });
check("list shows active projects (2) and hides the done one", (await page.locator("ul.grid > li").count()) === 2);
check("dated project shows a due label", await page.getByText("Due in 3 days").first().isVisible());
check("ongoing project shows Ongoing · running", await page.getByText(/Ongoing · running 35 days/).first().isVisible());
check("dated project shows progress text", await page.getByText("1 of 4 tasks done").isVisible());
check("ongoing project shows open/done counts", await page.getByText("1 open · 0 done").isVisible());
await page.getByRole("tab", { name: /^Done/ }).click();
check("Done tab lists the finished project", (await page.getByText("Old portfolio").count()) > 0);
await page.getByRole("tab", { name: /^Active/ }).click();
await page.getByRole("tab", { name: "Social media" }).click();
check("type filter narrows to the social project", (await page.locator("ul.grid > li").count()) === 1);
await page.getByRole("tab", { name: "All" }).click();

// 2. add a dated project, from the list
await page.getByRole("button", { name: "New Project" }).click();
await page.getByLabel("Project name").fill("Eid sale landing page");
await page.getByLabel("Due date (optional)").fill("2026-10-20");
await page.getByLabel("Start date (optional)").fill("2026-10-10");
await page.screenshot({ path: S + "/pr-form.png" });
await page.getByRole("button", { name: "Add Link" }).count();
await page.getByRole("button", { name: /Add a link/ }).click();
await page.getByLabel("Link 1 label").fill("Live site");
await page.getByLabel("Link 1 address").fill("eid.example.com");
await page.getByRole("button", { name: "Add project" }).click();
await page.waitForURL(/\/projects\/[0-9a-f-]{36}/);
const created = lastWrite("POST", /^\/projects$/);
check("new dated project POST body", created?.body.name === "Eid sale landing page" && created.body.due_date === "2026-10-20" && created.body.start_date === "2026-10-10", JSON.stringify(created?.body));
check("link got https:// added", created?.body.links[0].url === "https://eid.example.com", created?.body.links[0].url);
await page.getByRole("heading", { name: "Eid sale landing page" }).waitFor();
check("went to the new project's page", true);

// 3. on the project page: add task, tick it, edit to ongoing, mark done / reopen
await page.getByLabel("New task").fill("Draft the headline");
await page.keyboard.press("Enter");
await page.getByText("Draft the headline").waitFor();
const t = lastWrite("POST", /^\/tasks$/);
check("quick-add task sent project_id", /^[0-9a-f-]{36}$/.test(t?.body.project_id ?? "") && t.body.title === "Draft the headline");
check("progress text updated at once", await page.getByText("of 1 done").isVisible());
await page.getByLabel("Draft the headline").click();
await page.waitForTimeout(300);
check("tick sent done:true", lastWrite("PATCH", /^\/tasks\//)?.body.done === true);
check("progress now 1 of 1", await page.getByText("1 of 1 done").isVisible());
await page.getByRole("button", { name: "Edit", exact: true }).click();
await page.getByRole("button", { name: "No due date" }).click();
await page.getByRole("button", { name: "Save changes" }).click();
await page.waitForTimeout(400);
const patch = lastWrite("PATCH", /^\/projects\/[0-9a-f-]{36}$/);
check("editing to ongoing sent due_date:null", patch?.body.due_date === null && patch.body.start_date === "2026-10-10", JSON.stringify({ d: patch?.body.due_date, s: patch?.body.start_date }));
await page.screenshot({ path: S + "/pr-detail.png", fullPage: true });
await page.getByRole("button", { name: "Mark done" }).click();
await page.getByRole("button", { name: "Reopen" }).waitFor();
check("Mark done → Reopen", lastWrite("PATCH", /^\/projects\//)?.body.status === "done");
await page.getByRole("button", { name: "Reopen" }).click();
await page.getByRole("button", { name: "Mark done" }).waitFor();

// 4. archive from the project page (no question, it can be undone), then delete it for good from the Archive
const eidUrl = page.url();
await page.getByRole("button", { name: "Archive", exact: true }).click();
await page.waitForURL(base + "/projects");
await page.waitForTimeout(500);
const arch = lastWrite("PATCH", /^\/projects\/[0-9a-f-]{36}$/);
check("Archive sends archived:true (no delete)", arch?.body.archived === true && !writes.some((w) => w.m === "DELETE"));
check("project left the Projects list", (await page.locator("ul.grid").getByText("Eid sale landing page").count()) === 0);
check("no 'not found' flash", (await page.getByText("Project not found").count()) === 0);
check("the page is called Archive, not delete: no 'Delete' button on the project page or list", (await page.getByRole("button", { name: /^Delete/ }).count()) === 0);
await page.getByRole("link", { name: "Archive" }).first().click();
await page.waitForURL(base + "/archive");
await page.locator("ul.space-y-3").getByText("Eid sale landing page").waitFor();
await page.screenshot({ path: S + "/pr-archive.png", fullPage: true });
check("the Archive lists it with its task count", await page.getByText(/with 1 task/).isVisible());
await page.getByRole("button", { name: "Delete Eid sale landing page for good" }).click();
const dlg = page.getByRole("dialog");
const text = await dlg.innerText();
check("delete-for-good confirm mentions the task count", /1 task/.test(text) && /forever/.test(text), text.replace(/\n/g, " | ").slice(0, 170));
await dlg.getByRole("button", { name: "Cancel" }).click();
check("cancelling deletes nothing", !writes.some((w) => w.m === "DELETE"));
await page.getByRole("button", { name: "Delete Eid sale landing page for good" }).click();
await page.getByRole("dialog").getByRole("button", { name: "Delete for good" }).click();
await page.waitForTimeout(500);
check("DELETE sent from the Archive", Boolean(lastWrite("DELETE", /^\/projects\/[0-9a-f-]{36}$/)));
check("removed from the Archive", (await page.locator("ul.space-y-3").getByText("Eid sale landing page").count()) === 0);
check("its task is gone too (cascade)", !db.tasks.some((x) => x.title === "Draft the headline"));
check("empty Archive says so", await page.getByText("The Archive is empty").isVisible());
// FIX 2: the page of a project deleted for good must not come back from the saved copy
await page.goto(eidUrl);
await page.waitForTimeout(800);
check("deleted project: opening its address shows 'Project not found', not the old page", (await page.getByText("Project not found").count()) > 0 && (await page.getByText("Eid sale landing page").count()) === 0);
await page.goto(base + "/projects");

// 5. an ongoing project (no dates): archive from the list card, restore from the Archive
await page.goto(base + "/projects");
await page.getByRole("button", { name: "New Project" }).click();
await page.getByLabel("Project name").fill("Personal branding");
await page.getByRole("button", { name: "Add project" }).click();
await page.waitForURL(/\/projects\/[0-9a-f-]{36}/);
const created2 = lastWrite("POST", /^\/projects$/);
check("ongoing project POST has no dates", created2.body.due_date === null && created2.body.start_date === null);
await page.getByText("Ongoing · started today").first().waitFor();
await page.goto(base + "/projects");
await page.getByText("Personal branding").first().waitFor();
await page.getByRole("button", { name: "Archive Personal branding" }).click();
await page.waitForTimeout(500);
check("list card Archive removes the card at once", (await page.locator("ul.grid").getByText("Personal branding").count()) === 0);
check("list card Archive sent archived:true", lastWrite("PATCH", /^\/projects\//)?.body.archived === true);
await page.goto(base + "/archive");
await page.locator("ul.space-y-3").getByText("Personal branding").waitFor();
await page.getByRole("button", { name: "Restore" }).click();
await page.waitForTimeout(500);
check("Restore sent archived:false", lastWrite("PATCH", /^\/projects\//)?.body.archived === false);
await page.goto(base + "/projects");
await page.waitForTimeout(900);
check("restored project is back in Projects", (await page.locator("ul.grid").getByText("Personal branding").count()) === 1);

// 6. the archived project's own page: banner, Restore, Delete for good
await page.getByRole("button", { name: "Archive Rahim's bakery website" }).click();
await page.waitForTimeout(400);
const bakeryId = bakery.id;
await page.goto(base + "/projects/" + bakeryId);
await page.getByText("This project is in the Archive").waitFor();
check("archived project page shows the banner", true);
check("archived project page has no Mark done / Archive buttons", (await page.getByRole("button", { name: "Mark done" }).count()) === 0 && (await page.getByRole("button", { name: "Archive", exact: true }).count()) === 0);
await page.getByRole("button", { name: "Delete for good" }).click();
check("page Delete for good says 4 tasks go too", /4 tasks/.test(await page.getByRole("dialog").innerText()));
await page.getByRole("dialog").getByRole("button", { name: "Cancel" }).click();
await page.getByRole("button", { name: "Restore" }).click();
await page.waitForTimeout(400);
check("page Restore works (banner gone)", (await page.getByText("This project is in the Archive").count()) === 0);

// 7. tasks page: badge, and the project select
await page.goto(base + "/tasks");
await page.getByText("Build menu page").waitFor();
await page.waitForTimeout(600);
check("task row shows its project badge", (await page.getByRole("link", { name: "Rahim's bakery website" }).count()) > 0);
await page.screenshot({ path: S + "/pr-tasks.png", fullPage: true });
await page.getByText("Build menu page").click();
check("task form has the Project select showing the task's project", (await page.getByLabel("Project").inputValue()) === bakery.id);
const before = writes.length;
await page.getByRole("button", { name: "Save task" }).click();
await page.waitForTimeout(400);
check("saving without touching Project sends no project_id", writes.length > before && !("project_id" in lastWrite("PATCH", /^\/tasks\//).body), JSON.stringify(Object.keys(lastWrite("PATCH", /^\/tasks\//).body)));
await page.getByText("Build menu page").click();
await page.getByLabel("Project").selectOption("");
await page.getByRole("button", { name: "Save task" }).click();
await page.waitForTimeout(400);
check("choosing 'No project' sends project_id:null", lastWrite("PATCH", /^\/tasks\//)?.body.project_id === null);
await page.getByRole("button", { name: /New Task/ }).first().click();
await page.getByLabel("Title").fill("Plan posts");
await page.getByLabel("Project").selectOption(fb.id);
await page.getByRole("button", { name: "Add task" }).click();
await page.waitForTimeout(400);
check("new task with a project sends project_id", lastWrite("POST", /^\/tasks$/)?.body.project_id === fb.id);
await page.getByRole("button", { name: /New Task/ }).first().click();
await page.getByLabel("Title").fill("Loose task");
await page.getByRole("button", { name: "Add task" }).click();
await page.waitForTimeout(400);
check("new task with no project omits project_id", !("project_id" in (lastWrite("POST", /^\/tasks$/)?.body ?? {})));

// 8. calendar chip, bell, Ctrl+K
await page.goto(base + "/calendar?date=2026-10-09");
await page.getByText("Project due:").waitFor();
await page.waitForTimeout(300);
await page.screenshot({ path: S + "/pr-calendar.png" });
check("calendar shows the project due date", await page.getByText("Project due:").isVisible());
await page.getByRole("button", { name: /notification/i }).first().click().catch(() => {});
await page.waitForTimeout(300);
await page.screenshot({ path: S + "/pr-bell.png" });
check("bell lists the project", (await page.getByText("is due in 3 days").count()) > 0);
await page.keyboard.press("Escape");
await page.goto(base + "/tasks");
await page.getByText("Build menu page").waitFor();
await page.keyboard.press("Control+k");
await page.getByPlaceholder(/Search pages/).fill("new project");
await page.getByRole("option", { name: /New project/ }).first().click().catch(async () => { await page.keyboard.press("Enter"); });
await page.waitForURL(/\/projects/);
await page.getByRole("heading", { name: "New project" }).waitFor();
check("Ctrl+K 'New project' opens the form", true);
await page.keyboard.press("Escape");

// 9. a project that does not exist
await page.goto(base + "/projects/99999999-9999-4999-8999-999999999999");
check("missing project shows a friendly page", await page.getByText("Project not found").waitFor({ timeout: 6000 }).then(() => true, () => false));

// 9b. long names and the phone task row
db.projects.push(proj({ id: "44444444-4444-4444-8444-444444444444", name: "Supercalifragilisticexpialidocious".repeat(3), client: "Averyveryveryveryveryveryveryverylongclientname".repeat(2) }));
db.tasks.push(task({ id: "z1", title: "Write the menu page copy for the bakery", project_id: bakery.id }));
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(base + "/projects/44444444-4444-4444-8444-444444444444");
await page.getByText("Brief & notes").waitFor();
await page.waitForTimeout(400);
await page.screenshot({ path: S + "/pr-longname.png", fullPage: true });
check("long name: project page has no sideways scroll", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
await page.goto(base + "/tasks");
await page.getByText("Write the menu page copy for the bakery").waitFor();
await page.waitForTimeout(400);
await page.screenshot({ path: S + "/pr-phone-tasks.png", fullPage: true });
const row = page.locator("li", { hasText: "Write the menu page copy for the bakery" }).first();
const titleBox = await row.getByText("Write the menu page copy for the bakery").boundingBox();
check("phone: task title is not squeezed by the project badge (fits in <=2 lines)", titleBox && titleBox.height < 50, titleBox ? `height ${Math.round(titleBox.height)}px` : "");
check("phone: project name still shown on the task row", (await row.getByText("Rahim's bakery website").filter({ visible: true }).count()) >= 1);
await page.setViewportSize({ width: 1440, height: 1000 });

// 10. phone width
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(base + "/projects");
await page.getByText("Rahim's bakery website").first().waitFor();
await page.waitForTimeout(400);
await page.screenshot({ path: S + "/pr-mobile-list.png", fullPage: true });
check("phone: list has no sideways scroll", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
await page.getByText("Rahim's bakery website").first().click();
await page.getByText("Brief & notes").waitFor();
await page.waitForTimeout(400);
await page.screenshot({ path: S + "/pr-mobile-detail.png", fullPage: true });
check("phone: detail page has no sideways scroll", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
check("unsafe link is not clickable", (await page.locator('a[href^="javascript:"]').count()) === 0);

console.log("\nconsole/page errors:", errors);
await browser.close();
