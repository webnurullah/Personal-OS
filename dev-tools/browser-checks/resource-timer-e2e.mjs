// Browser check for the certificate course timer in the library: To do + Start now, then Resume / Pause + Complete, no small status chip,
// the clock counts, and the playlist keeps its three buttons. The built app must be running on http://localhost:3123.   Run:  node resource-timer-e2e.mjs
import { launch, newPhone, apiMock, measure, BASE, TODAY, session } from "/home/user/Personal-OS/dev-tools/browser-checks/audit-lib.mjs";
import { endFor, projectState } from "/home/user/Personal-OS/web/lib/project-time.ts";

let failures = 0;
const check = (name, ok, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  → " + extra : ""}`);
};
const REAL = new Date().toISOString().slice(0, 10);
const base = { course_id: "c1", unit_id: null, practice_project_id: null, kind: "certificate", url: "", platform: "Coursera", provider: "", status: "todo", priority: "medium", est_hours: 0, items_total: 0, items_done: 0, due_date: null, started_on: null, completed_on: null, certificate_id: "", certificate_url: "", issued_on: null, expires_on: null, rating: 0, takeaway: "", dropped_reason: "", notes: "", skills: [], cost: 0, created_at: "2026-10-03T00:00:00Z" };
const browser = await launch();

for (const width of [390, 320, 1280]) {
  const wide = width >= 1000;
  const ctx = wide ? await browser.newContext({ viewport: { width, height: 900 } }) : await newPhone(browser, width);
  if (wide) await ctx.addCookies([{ name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), url: BASE }]);
  const items = [
    { ...base, id: "r1", title: "Foundations of Digital Marketing and E-commerce", status: "todo" },
    { ...base, id: "r2", title: "Playlist about SEO", kind: "playlist", platform: "YouTube", status: "todo" },
  ];
  const rows = [];
  const calls = [];
  const stateFor = (id) => {
    const running = rows.find((r) => !r.ended_at);
    const own = rows.filter((r) => r.id === id && r.ended_at).map((r) => ({ project_id: id, started_at: r.started_at, ended_at: r.ended_at }));
    return projectState(running ? [...own, { project_id: running.id, started_at: running.started_at, ended_at: null }] : own, id, running ? "Foundations" : "", REAL, "UTC", Date.now(), running ? "resource" : "project");
  };
  await apiMock(ctx, {});
  await ctx.route("**/api/resources**", async (route) => {
    const req = route.request(), path = new URL(req.url()).pathname.replace("/api", ""), method = req.method();
    const body = req.postData() ? JSON.parse(req.postData()) : undefined;
    if (method !== "GET") calls.push({ method, path, body });
    if (path === "/resources") return route.fulfill({ json: { today: TODAY, items } });
    let m = path.match(/^\/resources\/([^/]+)\/time$/);
    if (m) {
      if (method === "POST") {
        const here = rows.find((r) => !r.ended_at);
        if (body.action === "start" && !here) rows.push({ id: m[1], started_at: new Date().toISOString(), ended_at: null });
        else if (body.action === "pause" && here) here.ended_at = endFor(here.started_at, Date.now() + 65000);
      }
      return route.fulfill({ json: stateFor(m[1]) });
    }
    m = path.match(/^\/resources\/([^/]+)$/);
    if (m && method === "PATCH") {
      const i = items.findIndex((r) => r.id === m[1]);
      items[i] = { ...items[i], ...body };
      return route.fulfill({ json: items[i] });
    }
    return route.fulfill({ json: {} });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/learning/library`);
  const card = (title) => page.locator("li.card", { hasText: title });
  const cert = card("Foundations of Digital Marketing");
  await cert.waitFor();

  check(`${width}px: a To do certificate shows To do and Start now`, (await cert.getByRole("button", { name: "To do" }).count()) === 1 && (await cert.getByRole("button", { name: "Start now" }).count()) === 1);
  check(`${width}px: no small status chip, no Learning/Complete buttons`, (await cert.locator("span.badge", { hasText: /^To do$/ }).count()) === 0 && (await cert.getByRole("button", { name: "Complete" }).count()) === 0);
  check(`${width}px: a playlist keeps To do / Learning / Complete`, (await card("Playlist about SEO").getByRole("button", { name: "Learning", exact: true }).count()) === 1 && (await card("Playlist about SEO").getByRole("button", { name: "Complete", exact: true }).count()) === 1 && (await card("Playlist about SEO").getByRole("button", { name: "To do", exact: true }).count()) === 1);
  if (width <= 390) {
    const m = await measure(page, width);
    check(`${width}px: no overflow with the Start now row`, !m.zoomedOut && m.mainClipped === 0, JSON.stringify(m));
  }

  calls.length = 0;
  await cert.getByRole("button", { name: "Start now" }).click();
  await cert.getByRole("button", { name: "Pause" }).waitFor();
  check(`${width}px: Start now makes it Learning and starts the timer`, calls.some((c) => c.method === "PATCH" && c.body?.status === "learning") && calls.some((c) => c.path === "/resources/r1/time" && c.body?.action === "start"), JSON.stringify(calls));
  check(`${width}px: started: Pause and Complete (no To do, no small chip)`, (await cert.getByRole("button", { name: "Pause" }).count()) === 1 && (await cert.getByRole("button", { name: "Complete" }).count()) === 1 && (await cert.getByRole("button", { name: "To do" }).count()) === 0 && (await cert.locator("span.badge", { hasText: /^Learning$/ }).count()) === 0);
  await page.waitForFunction(() => /0:00:0[1-9]/.test(document.querySelector('[role="timer"]')?.textContent ?? ""), null, { timeout: 8000 }).then(() => check(`${width}px: the clock counts`, true), () => check(`${width}px: the clock counts`, false));
  if (width <= 390) {
    const m = await measure(page, width);
    check(`${width}px: no overflow while running`, !m.zoomedOut && m.mainClipped === 0, JSON.stringify(m));
  }
  await cert.getByRole("button", { name: "Pause" }).click();
  await cert.getByRole("button", { name: "Resume" }).waitFor();
  check(`${width}px: paused: Resume and Complete, the time is kept`, !/^0:00:00/.test((await cert.getByRole("timer").textContent()) ?? "") && (await cert.getByRole("button", { name: "Complete" }).count()) === 1);
  check(`${width}px: no page errors`, errors.length === 0, errors.join("; "));
  await ctx.close();
}

await browser.close();
console.log(failures ? `${failures} CHECK(S) FAILED` : "ALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
