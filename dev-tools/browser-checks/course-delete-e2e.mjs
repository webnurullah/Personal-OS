// Browser check for deleting a course: the question says everything that goes with it (units and topics, study sessions, tasks,
// certificates, courses and playlists), Cancel changes nothing, and Delete sends one request and leaves for the Learning page.
// The built app must be running on http://localhost:3123.   Run:  node course-delete-e2e.mjs
import { launch, newPhone, apiMock, measure, BASE, TODAY, session } from "/home/user/Personal-OS/dev-tools/browser-checks/audit-lib.mjs";

let failures = 0;
const check = (name, ok, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  → " + extra : ""}`);
};

const course = { id: "c1", title: "Digital Marketing Masterclass with a very long name that must wrap on a phone", subtitle: "", category: "", status: "active", start_date: "2026-09-14", target_date: "2026-12-31", color: "blue", est_hours: 10, done_hours: 2, spent_hours: 2, percent: 20, topic_count: 3, unit_count: 2, days_left: 86, quote: "", weekly_plan: [], notes: "", notes_updated_at: null };
const topic = (id, unit, code) => ({ id, course_id: "c1", unit_id: unit, code, title: `Topic ${code}`, est_hours: 2, actual_hours: 0, manual_hours: 0, status: "not-started", planned_week: null, position: 0, notes: "" });
const units = [
  { id: "u1", course_id: "c1", code: "1", title: "SEO", color: "blue", position: 0, topics: [topic("t1", "u1", "1.1"), topic("t2", "u1", "1.2")] },
  { id: "u2", course_id: "c1", code: "2", title: "Ads", color: "green", position: 1, topics: [topic("t3", "u2", "2.1")] },
];
const browser = await launch();

for (const width of [390, 320, 1280]) {
  const wide = width >= 1000;
  const ctx = wide ? await browser.newContext({ viewport: { width, height: 900 } }) : await newPhone(browser, width);
  if (wide) await ctx.addCookies([{ name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), url: BASE }]);
  const deletes = [];
  await apiMock(ctx, { "/courses/c1": (method) => (method === "DELETE" ? (deletes.push("c1"), { ok: true }) : { today: TODAY, course, units }) });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/learning/c1`);
  await page.getByRole("button", { name: "Delete", exact: true }).first().waitFor();

  await page.getByRole("button", { name: "Delete", exact: true }).first().click();
  const dialog = page.locator("dialog[open]");
  await dialog.waitFor();
  const text = await dialog.innerText();
  check(`${width}px: the question names the course and says it moves to the Archive`, text.includes("Digital Marketing Masterclass") && /move to the Archive/.test(text) && /restore/.test(text));
  check(`${width}px: it says what goes with the course: 2 units, 3 topics, study sessions, tasks, certificates, courses and playlists`, /2 units and 3 topics/.test(text) && /study sessions and tasks/.test(text) && /certificates, courses and playlists/.test(text), text);
  const m = await measure(page, width);
  check(`${width}px: the question fits the screen`, !m.zoomedOut && m.mainClipped === 0 && m.offenders.length === 0, JSON.stringify(m));
  const box = await dialog.locator("button", { hasText: "Delete course" }).boundingBox();
  check(`${width}px: the Delete course button is inside the screen`, box && box.x >= 0 && box.x + box.width <= width + 0.5, JSON.stringify(box));

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await page.waitForTimeout(300);
  check(`${width}px: Cancel closes it and deletes nothing`, (await page.locator("dialog[open]").count()) === 0 && deletes.length === 0 && page.url().endsWith("/learning/c1"));

  await page.getByRole("button", { name: "Delete", exact: true }).first().click();
  await page.locator("dialog[open]").getByRole("button", { name: "Delete course" }).click();
  await page.waitForURL(/\/learning$/, { timeout: 8000 });
  check(`${width}px: Delete sends one request and goes to the Learning page`, deletes.length === 1 && page.url().endsWith("/learning"));
  check(`${width}px: no page errors`, errors.length === 0, errors.join("; "));
  await ctx.close();
}
await browser.close();
console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
