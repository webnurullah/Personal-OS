// Browser check for Job Apply ordering and the favourite star: starred jobs first, then saved jobs, the ones you applied for below.
// The built app must be running on http://localhost:3123.   Run:  node job-favourite-e2e.mjs   (a stand-in API answers; SHOTS=<folder> saves pictures)
import { launch, newPhone, apiMock, measure, BASE, TODAY, session } from "/home/user/Personal-OS/dev-tools/browser-checks/audit-lib.mjs";

let failures = 0;
const check = (name, ok, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  → " + extra : ""}`);
};

const LONG = "Unbroken" + "Segment".repeat(14);
const job = (id, title, over = {}) => ({ id, url: "", title, company: "", location: "", deadline: null, status: "saved", applied_on: null, summary: "", requirements: [], skills: [], notes: "", image_url: null, favourite: false, created_at: "2026-10-01T00:00:00Z", ...over });
const seed = () => [
  job("j1", "Saved late", { deadline: "2026-12-01" }),
  job("j2", "Saved soon", { deadline: "2026-10-09" }),
  job("j3", "Applied one", { status: "applied", applied_on: "2026-10-04" }),
  job("j4", "Star applied", { status: "applied", applied_on: "2026-10-03", favourite: true }),
  job("j5", LONG, { favourite: true }),
  job("j6", "Interview one", { status: "interview", applied_on: "2026-10-01" }),
  job("j7", "Rejected one", { status: "rejected", applied_on: "2026-09-20" }),
];

const browser = await launch();

for (const width of [390, 320, 1280]) {
  const wide = width >= 1000;
  const ctx = wide ? await browser.newContext({ viewport: { width, height: 900 } }) : await newPhone(browser, width);
  if (wide) await ctx.addCookies([{ name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), url: BASE }]);
  let list = seed();
  const calls = [];
  await apiMock(ctx, { "/jobs": () => ({ today: TODAY, items: list }), "/companies": { today: TODAY, items: [] } });
  await ctx.route(/\/api\/jobs\/[^/]+$/, (route) => {
    const req = route.request();
    if (req.method() !== "PATCH") return route.fallback();
    const id = req.url().split("/").pop();
    const body = req.postDataJSON();
    calls.push({ id, body });
    list = list.map((j) => (j.id === id ? { ...j, ...body } : j));
    return route.fulfill({ json: list.find((j) => j.id === id) });
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/jobs`);
  await page.getByText("Saved soon").first().waitFor();
  const order = async () => (await page.locator("article h3").allInnerTexts()).map((t) => t.trim().replace(LONG, "LONG"));

  // ---- the order: starred first (saved before applied among them), then saved (nearest date first), then applied (latest first), then interview; closed ones last
  let now = await order();
  check(`${width}px: starred first, then saved, then the ones applied for, closed ones last`, JSON.stringify(now) === JSON.stringify(["LONG", "Star applied", "Saved soon", "Saved late", "Applied one", "Interview one", "Rejected one"]), JSON.stringify(now));
  check(`${width}px: the stars show which jobs are favourites`, (await page.getByRole("button", { name: `Favourite: ${LONG}`, exact: true }).getAttribute("aria-pressed")) === "true" && (await page.getByRole("button", { name: "Favourite: Saved soon" }).getAttribute("aria-pressed")) === "false");
  check(`${width}px: the finished ones are under their own heading`, (await page.getByRole("heading", { name: /Closed or finished \(1\)/ }).count()) === 1);
  let m = await measure(page, width);
  check(`${width}px: the list does not overflow (stars, a 100-letter title)`, !m.zoomedOut && m.mainClipped === 0 && m.offenders.length === 0, JSON.stringify(m));
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/job-favourite-${width}.png`, fullPage: true });

  // ---- starring a saved job moves it up; the change is sent
  await page.getByRole("button", { name: "Favourite: Saved late" }).click();
  await page.waitForTimeout(500);
  now = await order();
  check(`${width}px: starring "Saved late" lists it first (above the unstarred saved jobs)`, JSON.stringify(now) === JSON.stringify(["Saved late", "LONG", "Star applied", "Saved soon", "Applied one", "Interview one", "Rejected one"]), JSON.stringify(now));
  check(`${width}px: the star is saved on that job`, calls.length === 1 && calls[0].id === "j1" && JSON.stringify(calls[0].body) === JSON.stringify({ favourite: true }), JSON.stringify(calls));
  check(`${width}px: it says so, and that favourites are listed first`, (await page.getByText(/Added to your favourites/).count()) >= 1);

  // ---- removing the star puts it back
  await page.getByRole("button", { name: "Favourite: Star applied" }).click();
  await page.waitForTimeout(500);
  now = await order();
  check(`${width}px: removing a star moves an applied job down below the saved ones`, JSON.stringify(now) === JSON.stringify(["Saved late", "LONG", "Saved soon", "Applied one", "Star applied", "Interview one", "Rejected one"]), JSON.stringify(now));
  check(`${width}px: the star is cleared on that job`, JSON.stringify(calls[1]?.body) === JSON.stringify({ favourite: false }), JSON.stringify(calls));

  // ---- marking a job applied sends it below the saved ones (and the star keeps it on top)
  await page.locator("article", { hasText: "Saved soon" }).getByRole("combobox").selectOption("applied");
  await page.waitForTimeout(500);
  now = await order();
  check(`${width}px: a saved job that is marked applied goes below the saved ones`, now.indexOf("Saved soon") > now.indexOf("LONG") && now.indexOf("Saved soon") > now.indexOf("Saved late") && now.indexOf("Saved soon") < now.indexOf("Interview one"), JSON.stringify(now));

  // ---- the Board: the same order inside each column, and a star on its cards
  await page.getByRole("tab", { name: "Board" }).click();
  await page.getByRole("region", { name: "Saved" }).waitFor();
  const savedColumn = (await page.getByRole("region", { name: "Saved" }).locator("article span.font-semibold").allInnerTexts()).map((t) => t.trim().replace(LONG, "LONG"));
  check(`${width}px: the Board's Saved column lists the starred ones first`, JSON.stringify(savedColumn) === JSON.stringify(["Saved late", "LONG"]), JSON.stringify(savedColumn));
  check(`${width}px: Board cards have the star too`, (await page.getByRole("region", { name: "Saved" }).getByRole("button", { name: /^Favourite:/ }).count()) === 2);
  calls.length = 0;
  await page.getByRole("region", { name: "Saved" }).getByRole("button", { name: `Favourite: ${LONG}`, exact: true }).click();
  await page.waitForTimeout(500);
  check(`${width}px: a star on the Board is saved`, calls.length === 1 && calls[0].id === "j5" && calls[0].body.favourite === false, JSON.stringify(calls));
  m = await measure(page, width);
  check(`${width}px: the Board does not overflow with the stars`, !m.zoomedOut && m.mainClipped === 0 && m.offenders.length === 0, JSON.stringify(m));
  await ctx.close();
}

await browser.close();
console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
