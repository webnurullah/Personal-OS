// Browser check for the timer circles above the AI circle: every running timer is a circle on every page, tap for the card (module,
// name, clock, Pause / Start), several run at once, pausing one leaves the others running, a paused circle stays and can be started again.
// The built app must be running on http://localhost:3123.   Run:  node running-timers-e2e.mjs
import { launch, newPhone, apiMock, measure, BASE, TODAY, session } from "/home/user/Personal-OS/dev-tools/browser-checks/audit-lib.mjs";

let failures = 0;
const check = (name, ok, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  → " + extra : ""}`);
};
const browser = await launch();

for (const width of [390, 320, 1280]) {
  const wide = width >= 1000;
  const ctx = wide ? await browser.newContext({ viewport: { width, height: 900 } }) : await newPhone(browser, width);
  if (wide) await ctx.addCookies([{ name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), url: BASE }]);
  const started = new Date(Date.now() - 65_000).toISOString();
  const all = {
    "project:p1": { key: "project:p1", kind: "project", id: "p1", name: "CRM with a rather long project name for a phone screen", module: "Project", href: "/projects/p1", started_at: started, closed_seconds: 2700 },
    "course:c1": { key: "course:c1", kind: "course", id: "c1", name: "Digital Marketing", module: "Course", href: "/learning/c1", started_at: started, closed_seconds: 600 },
  };
  const running = new Set(["project:p1", "course:c1"]);
  const calls = [];
  await apiMock(ctx, {
    "/timer/running": () => ({ now: new Date().toISOString(), timers: [...running].map((k) => all[k]) }),
  });
  await ctx.route("**/api/**/time", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace("/api", "");
    if (req.method() === "POST") {
      const { action } = JSON.parse(req.postData() ?? "{}");
      const key = path.startsWith("/projects/") ? "project:" + path.split("/")[2] : "course:" + path.split("/")[2];
      calls.push({ path, action });
      if (action === "pause") running.delete(key);
      else { running.add(key); all[key].started_at = new Date().toISOString(); }
    }
    await route.fulfill({ json: { now: new Date().toISOString(), closed_seconds: 2760, today_closed_seconds: 0, running: null } });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/learning/library`);
  const circle = (name) => page.getByRole("button", { name: new RegExp(name) });
  await circle("Project CRM").waitFor();
  check(`${width}px: a circle for each running timer`, (await circle("Project CRM").count()) === 1 && (await circle("Course Digital Marketing").count()) === 1);
  check(`${width}px: the circles show the time`, /running, 0:46:/.test((await circle("Project CRM").getAttribute("aria-label")) ?? "") && /running, 0:11:/.test((await circle("Course Digital").getAttribute("aria-label")) ?? ""), (await circle("Project CRM").getAttribute("aria-label")) ?? "");
  const box = await circle("Project CRM").boundingBox();
  const ai = page.getByRole("button", { name: /Open (Quick Add|POS Assistant)/ });
  const aiBox = (await ai.count()) ? await ai.boundingBox() : null;
  check(`${width}px: the first circle sits right above the AI circle (a small gap), inside the screen`, box && box.x + box.width <= width && (!aiBox || (box.y + box.height <= aiBox.y && aiBox.y - (box.y + box.height) <= 12)), JSON.stringify({ box, aiBox }));

  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/circles-${width}.png` });
  const before = await circle("Project CRM").boundingBox();
  const courseBefore = await circle("Course Digital").boundingBox();
  await circle("Project CRM").click();
  await page.getByRole("timer", { name: /Time spent on CRM/ }).waitFor();
  const after = await circle("Project CRM").boundingBox();
  check(`${width}px: opening the card does not move any circle`, Math.abs(after.x - before.x) < 1 && Math.abs(after.y - before.y) < 1 && Math.abs((await circle("Course Digital").boundingBox()).y - courseBefore.y) < 1, JSON.stringify({ before, after }));
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/circles-open-${width}.png` });
  const card = page.getByRole("timer", { name: /Time spent on CRM/ });
  await card.waitFor();
  const cb = await card.boundingBox();
  check(`${width}px: the card shows module, name, clock and Pause`, (await page.getByText("Project", { exact: true }).count()) >= 1 && (await page.getByRole("link", { name: /CRM with a rather long/ }).count()) === 1 && /0:4[67]:/.test((await card.textContent()) ?? "") && (await page.getByRole("button", { name: "Pause" }).count()) === 1);
  check(`${width}px: the card is inside the screen`, cb && cb.x >= 0 && cb.x + cb.width <= width, JSON.stringify(cb));
  if (width <= 390) {
    const m = await measure(page, width);
    check(`${width}px: no page overflow with the card open`, !m.zoomedOut && m.mainClipped === 0, JSON.stringify(m));
  }

  calls.length = 0;
  await page.getByRole("button", { name: "Pause" }).click();
  await page.getByRole("button", { name: "Start" }).waitFor();
  check(`${width}px: Pause pauses only this timer (the course keeps running)`, calls.length === 1 && calls[0].path === "/projects/p1/time" && calls[0].action === "pause" && running.has("course:c1") && !running.has("project:p1"));
  check(`${width}px: the paused circle stays, with Start`, /paused/.test((await circle("Project CRM").getAttribute("aria-label")) ?? "") && /running/.test((await circle("Course Digital").getAttribute("aria-label")) ?? ""));
  await page.getByRole("button", { name: "Start" }).click();
  await page.getByRole("button", { name: "Pause" }).waitFor();
  check(`${width}px: Start runs it again`, running.has("project:p1") && calls.at(-1).action === "start");

  await page.getByRole("button", { name: "Pause" }).click();
  await page.getByRole("button", { name: /Hide CRM/ }).click();
  check(`${width}px: × hides a paused circle`, (await circle("Project CRM").count()) === 0 && (await circle("Course Digital").count()) === 1);
  check(`${width}px: no page errors`, errors.length === 0, errors.join("; "));
  await ctx.close();
}
await browser.close();
console.log(failures ? `${failures} CHECK(S) FAILED` : "ALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
