// Browser check for folding the "No date" (and "Completed") group on the Tasks page.
// The app must be running on http://localhost:3123.   Run:  node tasks-fold-e2e.mjs   (a stand-in API answers; SHOTS=<folder> saves pictures)
import { launch, newPhone, apiMock, measure, BASE, TODAY, session } from "/home/user/Personal-OS/dev-tools/browser-checks/audit-lib.mjs";

let failures = 0;
const check = (name, ok, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  → " + extra : ""}`);
};

const task = (id, title, over = {}) => ({ id, title, notes: "", due_date: null, end_date: null, done_at: null, category_id: null, project_id: null, priority: "medium", created_at: "2026-10-01T00:00:00Z", ...over });
const items = [
  task("t1", "Pay the electricity bill", { due_date: TODAY }),
  task("n1", "Learn a new recipe"),
  task("n2", "Sort the old photos"),
  task("n3", "Plan the weekend trip"),
  task("d1", "Renew the passport", { due_date: "2026-10-01", done_at: "2026-10-02T08:00:00Z" }),
];

const browser = await launch();
for (const width of [390, 320, 1280]) {
  const wide = width >= 1000;
  const ctx = wide ? await browser.newContext({ viewport: { width, height: 900 } }) : await newPhone(browser, width);
  if (wide) await ctx.addCookies([{ name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), url: BASE }]);
  await apiMock(ctx, { "/tasks": { today: TODAY, items }, "/projects": { today: TODAY, items: [] } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/tasks`);
  const list = page.locator("section[aria-label='Task list']");
  await list.getByText("Pay the electricity bill").waitFor();
  const noDate = list.locator("h3 button", { hasText: "No date" });
  const completed = list.locator("h3 button", { hasText: "Completed" });
  const shown = (text) => list.getByText(text, { exact: true }).isVisible().catch(() => false);

  // ---- starts open; the header shows the count and is a button
  check(`${width}px: "No date" starts open, with its count (3) and a button on the header`, (await noDate.getAttribute("aria-expanded")) === "true" && (await noDate.innerText()).includes("3") && (await shown("Learn a new recipe")));
  check(`${width}px: "Completed" starts folded (as before)`, (await completed.getAttribute("aria-expanded")) === "false" && !(await shown("Renew the passport")));

  // ---- fold it
  await noDate.click();
  check(`${width}px: clicking "No date" hides its tasks and keeps the header with the count`, (await noDate.getAttribute("aria-expanded")) === "false" && !(await shown("Learn a new recipe")) && !(await shown("Plan the weekend trip")) && (await noDate.innerText()).includes("3"));
  check(`${width}px: the other groups are not touched`, await shown("Pay the electricity bill"));
  if (width === 390 && process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/tasks-fold-390.png` });

  // ---- remembered on this device
  await page.reload();
  await list.getByText("Pay the electricity bill").waitFor();
  check(`${width}px: after a reload it is still folded`, (await noDate.getAttribute("aria-expanded")) === "false" && !(await shown("Learn a new recipe")));

  // ---- searching opens it so a match is never hidden
  const search = list.locator("input[type=search]");
  await search.fill("recipe");
  check(`${width}px: a search shows the match inside the folded group`, await shown("Learn a new recipe"));
  await search.fill("");
  check(`${width}px: clearing the search folds it again`, !(await shown("Learn a new recipe")));

  // ---- open it again
  await noDate.click();
  check(`${width}px: clicking again opens it`, (await noDate.getAttribute("aria-expanded")) === "true" && (await shown("Sort the old photos")));
  await page.reload();
  await list.getByText("Pay the electricity bill").waitFor();
  check(`${width}px: and stays open after a reload`, (await noDate.getAttribute("aria-expanded")) === "true");

  // ---- Completed still folds on its own
  await completed.click();
  check(`${width}px: "Completed" opens on its own, independent of "No date"`, (await completed.getAttribute("aria-expanded")) === "true" && (await shown("Renew the passport")) && (await shown("Learn a new recipe")));

  // ---- keyboard
  await noDate.focus();
  await page.keyboard.press("Enter");
  check(`${width}px: the header folds with the keyboard (Enter)`, (await noDate.getAttribute("aria-expanded")) === "false");

  const m = await measure(page, width);
  check(`${width}px: no sideways scrolling`, !m.zoomedOut && m.mainClipped === 0 && m.offenders.length === 0, JSON.stringify(m));
  check(`${width}px: no page errors`, errors.length === 0, errors.join(" | "));
  await ctx.close();
}

// A browser whose storage throws still shows the page (the choice is just not remembered).
{
  const ctx = await newPhone(browser, 390);
  await ctx.addInitScript(() => {
    Object.defineProperty(window, "localStorage", { get() { throw new Error("blocked"); } });
  });
  await apiMock(ctx, { "/tasks": { today: TODAY, items }, "/projects": { today: TODAY, items: [] } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/tasks`);
  const list = page.locator("section[aria-label='Task list']");
  await list.getByText("Pay the electricity bill").waitFor();
  const noDate = list.locator("h3 button", { hasText: "No date" });
  await noDate.click();
  check("blocked storage: the group still folds and nothing crashes", (await noDate.getAttribute("aria-expanded")) === "false" && errors.length === 0, errors.join(" | "));
  await ctx.close();
}

await browser.close();
console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
