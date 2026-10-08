import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
const base = "http://localhost:3123", S = process.argv[2], T = "2026-10-06";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const now = Math.floor(Date.now() / 1000);
const session = { access_token: "x.y.z", refresh_token: "r", token_type: "bearer", expires_in: 99999999, expires_at: now + 99999999, user: { id: "u1", aud: "authenticated", email: "me@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
await ctx.addCookies([{ name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), url: base }]);

const uid = () => crypto.randomUUID();
const entry = (over) => ({ id: uid(), source: "item", kind: "task", title: "x", detail: "", related: 0, deleted_at: "2026-10-05T10:00:00Z", deleted_on: "2026-10-05", color: null, ...over });
let archive = [];
const writes = [];
const reset = () => {
  archive = [
    entry({ id: "t1", kind: "task", title: "Call the bank", detail: "2026-10-20", deleted_at: "2026-10-06T09:00:00Z", deleted_on: "2026-10-06" }),
    entry({ id: "g1", kind: "goal", title: "Learn SQL", detail: "on-track", related: 3, deleted_at: "2026-10-05T09:00:00Z" }),
    entry({ id: "m1", kind: "milestone", title: "Finish chapter 1", deleted_at: "2026-10-04T09:00:00Z", deleted_on: "2026-10-04" }),
    entry({ id: "h1", kind: "habit", title: "Exercise", related: 12, deleted_at: "2026-10-03T09:00:00Z", deleted_on: "2026-10-03" }),
    entry({ id: "x1", kind: "transaction", title: "Lunch with a very long description that goes on and on and on and on and on and on and on and on", detail: "expense 450.00", deleted_at: "2026-10-02T09:00:00Z", deleted_on: "2026-10-02" }),
    entry({ id: "p1", source: "project", kind: "project", title: "Old website", detail: "Website", related: 2, color: "amber", deleted_at: "2026-10-01T09:00:00Z", deleted_on: "2026-10-01" }),
  ];
  writes.length = 0;
};
reset();
let failRestoreOf = null;
const profile = { id: "u1", email: "me@example.com", today: T, full_name: "Nurullah", currency: "BDT", time_format: "12h", timezone: "Asia/Dhaka", week_start: 1, hide_amounts: false, skills: [], notify: {} };
const tasks = [{ id: "k1", title: "Pay rent", notes: "", priority: "medium", due_date: T, end_date: null, done_at: null, category_id: null, project_id: null, created_at: T }];
await ctx.route("**/api/**", async (route) => {
  const req = route.request(), u = new URL(req.url()), path = u.pathname.replace("/api", ""), p = path + u.search, m = req.method();
  const ok = (json, status = 200) => route.fulfill({ status, json });
  if (m !== "GET") writes.push({ m, p });
  if (p === "/assistant") return ok({ ai: false });
  if (p === "/profile") return ok(profile);
  if (p === "/notifications") return ok({ items: [], unread: 0 });
  if (p === "/categories") return ok({ items: [] });
  if (p === "/archive" && m === "GET") return ok({ today: T, items: archive });
  let mm;
  if ((mm = path.match(/^\/archive\/([^/]+)\/restore$/)) && m === "POST") {
    const found = archive.find((e) => e.id === mm[1]);
    if (failRestoreOf === mm[1]) return ok({ error: { message: "The goal this belongs to is not in your lists any more. Restore the goal from the Archive first, then restore this." } }, 400);
    archive = archive.filter((e) => e !== found);
    return ok({ kind: found.kind, id: "new", title: found.title });
  }
  if ((mm = path.match(/^\/archive\/([^/]+)$/)) && m === "DELETE") { archive = archive.filter((e) => e.id !== mm[1]); return ok({ ok: true }); }
  if ((mm = path.match(/^\/projects\/([^/]+)$/))) {
    if (m === "PATCH") { archive = archive.filter((e) => e.id !== mm[1]); return ok({ id: mm[1] }); }
    if (m === "DELETE") { archive = archive.filter((e) => e.id !== mm[1]); return ok({ ok: true }); }
  }
  if (p === "/tasks" && m === "GET") return ok({ today: T, items: tasks });
  if (path.startsWith("/tasks/") && m === "DELETE") return ok({ ok: true });
  if (p.startsWith("/projects")) return ok({ items: [], today: T });
  return ok({ items: [], today: T });
});
const page = await ctx.newPage();
const errors = []; page.on("pageerror", (e) => errors.push("PAGE " + e)); page.on("console", (mm) => mm.type() === "error" && !/Failed to load resource/.test(mm.text()) && errors.push("CONSOLE " + mm.text()));
const out = [];
const check = (name, cond, extra = "") => { const l = `${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  → " + extra : ""}`; out.push(l); console.log(l); };
const rows = () => page.locator("ul.space-y-3 > li");

// ---- the page
await page.goto(base + "/archive");
await page.getByRole("heading", { name: "Archive" }).waitFor();
await rows().first().waitFor();
check("lists everything, newest first", (await rows().count()) === 6 && (await rows().first().innerText()).includes("Call the bank") && (await rows().last().innerText()).includes("Old website"));
check("each row says what it is and when it was deleted", (await rows().first().innerText()).includes("Task") && (await rows().first().innerText()).includes("Oct 20") && (await rows().first().innerText()).includes("Deleted Oct 6"), (await rows().first().innerText()).replace(/\n/g, " | "));
check("a goal says how many milestones went with it", (await rows().nth(1).innerText()).includes("with 3 milestones"));
check("a habit says how much history went with it", (await rows().nth(3).innerText()).includes("with 12 days of history"));
check("a transaction shows what it was", (await rows().nth(4).innerText()).includes("expense 450.00"));
check("a project shows up too, with its tasks", (await rows().nth(5).innerText()).includes("Project") && (await rows().nth(5).innerText()).includes("with 2 tasks"));
await page.screenshot({ path: S + "/ar-list.png", fullPage: true });

// ---- the filter
const select = page.getByLabel("Show");
check("the filter lists the kinds that are there, with counts", (await select.locator("option").allInnerTexts()).join("|").includes("Goal (1)") && (await select.locator("option").first().innerText()) === "Everything (6)");
await select.selectOption("goal");
check("filtering shows only that kind", (await rows().count()) === 1 && (await rows().first().innerText()).includes("Learn SQL"));
await select.selectOption("all");

// ---- restore
await rows().first().getByRole("button", { name: "Restore" }).click();
await page.getByText("Task “Call the bank” is back.").waitFor();
check("restore calls the restore endpoint", writes.some((w) => w.m === "POST" && w.p === "/archive/t1/restore"));
check("a restored item leaves the list", (await rows().count()) === 5 && !(await page.locator("ul.space-y-3").innerText()).includes("Call the bank"));

// ---- restore refused (milestone whose goal is still archived): the message says what to do, the row stays
failRestoreOf = "m1";
await page.locator("li", { hasText: "Finish chapter 1" }).getByRole("button", { name: "Restore" }).click();
await page.getByText(/Restore the goal from the Archive first/).waitFor();
check("a refused restore shows the reason and keeps the entry", (await rows().count()) === 5 && (await page.locator("li", { hasText: "Finish chapter 1" }).count()) === 1);
failRestoreOf = null;

// ---- delete for good: asks first, says what else goes
await page.locator("li", { hasText: "Learn SQL" }).getByRole("button", { name: /Delete Learn SQL for good/ }).click();
const dlg = page.getByRole("dialog");
const text = await dlg.innerText();
check("delete for good warns it is permanent and names what goes with it", /Learn SQL/.test(text) && /3 milestones/.test(text) && /forever/.test(text) && /cannot be undone/.test(text), text.replace(/\n/g, " | ").slice(0, 160));
await dlg.getByRole("button", { name: "Cancel" }).click();
check("cancelling deletes nothing", !writes.some((w) => w.m === "DELETE"));
await page.locator("li", { hasText: "Learn SQL" }).getByRole("button", { name: /Delete Learn SQL for good/ }).click();
await page.getByRole("dialog").getByRole("button", { name: "Delete for good" }).click();
await page.getByText("Goal deleted for good.").waitFor();
check("confirming deletes the Archive entry", writes.some((w) => w.m === "DELETE" && w.p === "/archive/g1") && (await page.locator("li", { hasText: "Learn SQL" }).count()) === 0);

// ---- projects keep their own endpoints
await page.locator("li", { hasText: "Old website" }).getByRole("button", { name: "Restore" }).click();
await page.getByText(/is back in Projects/).waitFor();
check("a project is restored through the projects endpoint", writes.some((w) => w.m === "PATCH" && w.p === "/projects/p1"));
archive.push(entry({ id: "p2", source: "project", kind: "project", title: "Second site", detail: "Website", related: 2, color: "blue" }));
await page.reload();
await page.locator("li", { hasText: "Second site" }).waitFor();
await page.locator("li", { hasText: "Second site" }).getByRole("button", { name: /Delete Second site for good/ }).click();
check("deleting a project for good says its tasks go too", /2 tasks/.test(await page.getByRole("dialog").innerText()));
await page.getByRole("dialog").getByRole("button", { name: "Delete for good" }).click();
await page.getByText("Project deleted").waitFor();
check("project delete uses the projects endpoint", writes.some((w) => w.m === "DELETE" && w.p === "/projects/p2"));

// ---- empty
archive = [];
await page.reload();
await page.getByText("The Archive is empty").waitFor();
check("an empty Archive explains itself", (await page.getByText(/Nothing is gone for good until you delete it from this page/).count()) === 1);

// ---- deleting a task elsewhere says it goes to the Archive
await page.goto(base + "/tasks");
await page.getByText("Pay rent").waitFor();
await page.getByRole("button", { name: "Delete Pay rent" }).click({ force: true });
const del = await page.getByRole("dialog").innerText();
check("delete confirmation says it moves to the Archive", /Pay rent/.test(del) && /move to the Archive/.test(del) && /restore it/.test(del), del.replace(/\n/g, " | ").slice(0, 170));
await page.getByRole("dialog").getByRole("button", { name: /Delete/ }).last().click();
await page.getByText("Task moved to the Archive").waitFor();
check("…and the toast says so", writes.some((w) => w.m === "DELETE" && w.p === "/tasks/k1"));

// ---- phone
archive = [entry({ id: "x9", kind: "note", title: "Averyveryveryveryveryveryveryveryveryveryverylongwordwithoutanyspaces ".repeat(2), detail: "Personal" }), entry({ id: "t9", kind: "task", title: "Short" })];
await page.setViewportSize({ width: 360, height: 740 });
await page.goto(base + "/archive");
await page.locator("li", { hasText: "Short" }).waitFor();
await page.screenshot({ path: S + "/ar-phone.png", fullPage: true });
check("phone: no sideways scroll, long titles wrap", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));

console.log("\nconsole/page errors:", errors);
console.log(out.some((l) => l.startsWith("FAIL")) ? "SOME FAILED" : `ALL ${out.length} PASSED`);
await browser.close();
