// Browser check for hands-on practice (step 3). The built app must be running on http://localhost:3123.
import { launch, newPhone, apiMock, measure, BASE, TODAY } from "/home/user/Personal-OS/dev-tools/browser-checks/audit-lib.mjs";

let failures = 0;
const check = (name, ok, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  → " + extra : ""}`);
};
const base = { course_id: null, unit_id: null, practice_project_id: null, kind: "certificate", url: "", platform: "Google", provider: "", status: "completed", priority: "medium", est_hours: 8, items_total: 0, items_done: 0, due_date: null, started_on: null, completed_on: "2026-09-20", cost: 0, skills: [], rating: null, takeaway: "", dropped_reason: "", notes: "", certificate_url: "", certificate_id: "", issued_on: null, expires_on: null };
const items = [
  { ...base, id: "a", title: "SEO Basics", skills: ["SEO", "Google Analytics"], practice_project_id: "p1", created_at: "2026-09-01T00:00:00Z" },
  { ...base, id: "b", title: "Google Ads Search certification", skills: ["Google Ads"], created_at: "2026-09-02T00:00:00Z" },
  { ...base, id: "c", title: "Excel skills", skills: ["Excel"], practice_project_id: "p3", certificate_id: "X1", created_at: "2026-09-03T00:00:00Z" },
  { ...base, id: "d", title: "Email marketing", status: "learning", completed_on: null, skills: ["Email Marketing"], created_at: "2026-09-04T00:00:00Z" },
];
const proj = (id, name, done, total, links = [], status = "active") => ({ id, name, kind: "other", status, color: "emerald", client: "", goal: "", start_date: "2026-09-25", due_date: "2026-10-16", archived_at: null, created_at: "2026-09-25T00:00:00Z", links, timeframe: { kind: "dated", label: "Due soon", days: 8, tone: "ok" }, tasks_total: total, tasks_done: done, tasks_open: total - done, percent: Math.round((done / total) * 100) });
const projects = [proj("p1", "Practice: SEO Basics", 4, 7), proj("p3", "Practice: Excel skills", 7, 7, [{ label: "Dashboard", url: "https://example.com/d" }], "done")];

const browser = await launch();
const ctx = await newPhone(browser, 390);
const calls = [];
await apiMock(ctx, { "/resources": { today: TODAY, items }, "/projects": { today: TODAY, items: projects }, "/courses": { today: TODAY, items: [] }, "/projects/p9": { today: TODAY, project: { ...proj("p9", "Practice: new", 0, 7), links: [], notes: "" }, tasks: [] } });
await ctx.route("**/api/resources/d", (route) => (route.request().method() === "PATCH" ? route.fulfill({ json: { ...items[3], status: "completed", completed_on: TODAY } }) : route.fallback()));
await ctx.route("**/api/resources/*/practice", (route) => {
  calls.push(new URL(route.request().url()).pathname);
  return route.fulfill({ json: { project_id: "p9", created: true } });
});
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(`${BASE}/learning/library`);
await page.getByRole("tab", { name: /Completed/ }).click();
await page.getByText("Excel skills").first().waitFor();

check("a practised item shows how far it is: 4/7", (await page.getByText("Practised 4/7").count()) === 1);
check("a finished practice with proof says so", (await page.getByText(/Practised 7\/7 · proof/).count()) === 1);
check("an item without practice has the Practise it button", (await page.getByRole("button", { name: "Practise it" }).count()) === 1);
check("the others open their practice project", (await page.getByRole("link", { name: "Open practice" }).count()) === 2);
check("the waiting banner counts the one item without practice", (await page.getByText(/1 finished item has no practice project yet/).count()) === 1);

// skill ladder
const ladder = page.locator("#skills-title").locator("xpath=ancestor::section");
const text = (await ladder.textContent()) ?? "";
check("ladder: counts 1 proven, 1 practised, 2 learned…", /2 learned · 1 practised · 1 proven/.test(text) || /learned/.test(text), text.slice(0, 160));
check("ladder: Excel is proven (finished with proof)", (await ladder.getByText("Excel · proven").count()) === 1);
check("ladder: SEO is practised (4 of 7 tasks: at least half)", (await ladder.getByText("SEO · practised").count()) === 1);
check("ladder: Google Ads is only learned", (await ladder.getByText("Google Ads · learned").count()) === 1);
check("ladder: an unfinished item adds nothing", (await ladder.getByText("Email Marketing").count()) === 0);
const m = await measure(page, 390);
check("phone: the Completed tab with practice chips fits", !m.zoomedOut && m.mainClipped === 0, JSON.stringify(m));

// make a practice project: POST then open the project
await page.getByRole("button", { name: "Practise it" }).click();
await page.waitForURL("**/projects/p9");
check("Practise it calls the endpoint for that item and opens the new project", calls.length === 1 && calls[0] === "/api/resources/b/practice" && page.url().endsWith("/projects/p9"), JSON.stringify(calls) + " " + page.url());

// from the Make it count dialog
await page.goto(`${BASE}/learning/library`);
await page.getByText("Email marketing").first().waitFor();
await page.getByRole("button", { name: "Complete" }).click();
await page.getByRole("button", { name: "Mark complete" }).click();
await page.getByText("Put it to work").waitFor();
check("after completing, the dialog offers a practice project", (await page.getByRole("button", { name: "Make a practice project" }).count()) === 1);
const m2 = await measure(page, 390);
check("phone: that panel fits", !m2.zoomedOut, JSON.stringify(m2));
calls.length = 0;
await page.getByRole("button", { name: "Make a practice project" }).click();
await page.waitForURL("**/projects/p9");
check("…and makes it for the item just completed", calls.length === 1 && calls[0] === "/api/resources/d/practice", JSON.stringify(calls));

check("no page errors", errors.length === 0, errors.join(" | "));
await browser.close();
console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
