// Browser check for Job Apply → Company list: the sub-menu, the page, and adding a company from a job's box.
// The built app must be running on http://localhost:3123.   Run:  node company-e2e.mjs   (a stand-in API answers; SHOTS=<folder> saves pictures)
import { launch, newPhone, apiMock, measure, BASE, TODAY, session } from "/home/user/Personal-OS/dev-tools/browser-checks/audit-lib.mjs";

let failures = 0;
const check = (name, ok, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  → " + extra : ""}`);
};

const LONG = "Unbroken" + "Segment".repeat(14);
const job = (id, title, company, over = {}) => ({ id, url: "https://example.com/job", title, company, location: "Dhaka", deadline: null, status: "saved", applied_on: null, summary: "", requirements: [], skills: [], notes: "", created_at: "2026-10-01T00:00:00Z", ...over });
const jobs = { today: TODAY, items: [job("j1", "MTO - Markopolo AI INC", "Markopolo AI INC"), job("j2", "Sales lead", "acme  inc"), job("j3", "No company", ""), job("j4", "Long one", LONG)] };
const company = (id, name, over = {}) => ({ id, name, website: "", facebook: "", linkedin: "", note: "", created_at: "2026-10-01T00:00:00Z", ...over });
const profile = null;

const browser = await launch();

for (const width of [390, 320, 1280]) {
  const wide = width >= 1000;
  const ctx = wide ? await browser.newContext({ viewport: { width, height: 900 } }) : await newPhone(browser, width);
  if (wide) await ctx.addCookies([{ name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), url: BASE }]);
  let list = [company("c1", "Acme Inc", { website: "https://acme.com", facebook: "https://facebook.com/acme", linkedin: "https://www.linkedin.com/company/acme", note: "Ask for Rahim in HR" }), company("c2", LONG)];
  const calls = [];
  await apiMock(ctx, { "/jobs": jobs, "/companies": () => ({ today: TODAY, items: list }) });
  await ctx.route(/\/api\/companies(\/[^/]+)?$/, (route) => {
    const req = route.request();
    if (req.method() === "GET") return route.fallback();
    const body = req.postDataJSON?.() ?? null;
    calls.push({ method: req.method(), url: new URL(req.url()).pathname.replace("/api", ""), body });
    if (req.method() === "POST") {
      const made = company(`c${list.length + 1}`, body.name, body);
      list = [...list, made];
      return route.fulfill({ status: 201, json: made });
    }
    if (req.method() === "PATCH") {
      list = list.map((c) => (c.id === req.url().split("/").pop() ? { ...c, ...body } : c));
      return route.fulfill({ json: list[0] });
    }
    list = list.filter((c) => c.id !== req.url().split("/").pop());
    return route.fulfill({ json: { ok: true } });
  });
  const page = await ctx.newPage();

  // ---- the Applications tab: the Add company button and the "In company list" mark
  await page.goto(`${BASE}/jobs`);
  await page.getByText("MTO - Markopolo AI INC").waitFor();
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/company-jobs-${width}.png`, fullPage: true });
  let m = await measure(page, width);
  check(`${width}px: the Applications tab does not overflow (long company name, Add company buttons)`, !m.zoomedOut && m.mainClipped === 0 && m.offenders.length === 0, JSON.stringify(m));
  const tabs = page.getByRole("navigation", { name: "Job Apply sections" });
  check(`${width}px: Job Apply has the tabs Applications and Company list`, JSON.stringify(await tabs.getByRole("link").allInnerTexts()) === JSON.stringify(["Applications", "Company list"]));
  check(`${width}px: a company not in the list has "Add company"; one that is shows "In company list" (spelled differently)`, (await page.getByRole("button", { name: "Add company: Markopolo AI INC" }).count()) === 1 && (await page.getByText("In company list").count()) === 2 && (await page.getByRole("button", { name: /Add acme/i }).count()) === 0, "the 100-letter company is in the list too");
  check(`${width}px: a job without a company has neither`, (await page.locator("article", { hasText: "No company" }).getByText(/Add company|In company list/).count()) === 0);

  await page.getByRole("button", { name: "Add company: Markopolo AI INC" }).click();
  const dialog = page.getByRole("dialog");
  check(`${width}px: the dialog has the company name filled in`, (await dialog.locator("#company-name").inputValue()) === "Markopolo AI INC");
  await page.waitForTimeout(100);
  check(`${width}px: with the name filled in, the cursor goes to Website`, await dialog.locator("#company-website").evaluate((el) => el === document.activeElement));
  // A wrong link is refused on the spot, naming the box, and nothing is sent.
  await dialog.locator("#company-website").fill("my company site");
  await dialog.getByRole("button", { name: "Add company" }).click();
  await page.waitForTimeout(300);
  check(`${width}px: a link with spaces is refused at once and nothing is sent`, calls.length === 0 && (await page.getByText("Website: That does not look like a website link.").count()) >= 1 && (await dialog.count()) === 1, JSON.stringify(calls));
  await dialog.locator("#company-website").fill("markopolo.ai");
  await dialog.locator("#company-facebook").fill("linkedin.com/company/x");
  await dialog.getByRole("button", { name: "Add company" }).click();
  await page.waitForTimeout(300);
  check(`${width}px: a LinkedIn link in the Facebook box is refused and says Facebook`, calls.length === 0 && (await page.getByText("Facebook: That does not look like a Facebook link.").count()) >= 1, JSON.stringify(calls));
  await dialog.locator("#company-facebook").fill("facebook.com/markopolo");
  await dialog.locator("#company-linkedin").fill("linkedin.com/company/markopolo");
  m = await measure(page, width);
  check(`${width}px: the dialog does not overflow`, !m.zoomedOut && m.mainClipped === 0 && m.offenders.length === 0, JSON.stringify(m));
  await dialog.getByRole("button", { name: "Add company" }).click();
  await page.waitForTimeout(700);
  const post = calls.find((c) => c.method === "POST");
  check(`${width}px: it is saved with the name and the three links (tidied to https://)`, post?.body?.name === "Markopolo AI INC" && post.body.website === "https://markopolo.ai" && post.body.facebook === "https://facebook.com/markopolo" && post.body.linkedin === "https://linkedin.com/company/markopolo", JSON.stringify(post?.body));
  check(`${width}px: the job's box now says it is in the list`, (await page.getByText("In company list").count()) === 3 && (await page.getByRole("button", { name: "Add company: Markopolo AI INC" }).count()) === 0);

  // ---- the Board view has the same Add company / In company list on its cards
  await page.getByRole("tab", { name: "Board" }).click();
  await page.getByText("Sales lead").waitFor();
  m = await measure(page, width);
  check(`${width}px: the Board does not overflow`, !m.zoomedOut && m.mainClipped === 0 && m.offenders.length === 0, JSON.stringify(m));
  check(`${width}px: Board cards show "In company list" for a listed company, and nothing for a job without a company`, (await page.getByText("In company list").count()) === 3 && (await page.locator("article", { hasText: "No company" }).getByText(/Add company|In company list/).count()) === 0);
  await page.getByRole("tab", { name: "List" }).click().catch(() => {});

  // ---- the Company list page
  await page.goto(`${BASE}/jobs/companies`);
  await page.getByRole("heading", { name: "Company list", exact: true }).waitFor();
  await page.getByText("Acme Inc").first().waitFor();
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/company-list-${width}.png`, fullPage: true });
  m = await measure(page, width);
  check(`${width}px: the Company list page does not overflow (a 100-letter name, long links)`, !m.zoomedOut && m.mainClipped === 0 && m.offenders.length === 0, JSON.stringify(m));
  const acme = page.locator("li", { hasText: "Acme Inc" }).first();
  const hrefs = await acme.locator("a").evaluateAll((els) => els.map((e) => [e.textContent.trim(), e.getAttribute("href"), e.getAttribute("target"), e.getAttribute("rel")]));
  check(`${width}px: a company shows Website, Facebook and LinkedIn as links that open in a new tab`, JSON.stringify(hrefs.map((h) => [h[0], h[1], h[2]])) === JSON.stringify([["Website", "https://acme.com", "_blank"], ["Facebook", "https://facebook.com/acme", "_blank"], ["LinkedIn", "https://www.linkedin.com/company/acme", "_blank"]]) && hrefs.every((h) => /noopener/.test(h[3])), JSON.stringify(hrefs));
  check(`${width}px: it counts the jobs of that company (matching names)`, (await acme.getByText("1 job in Job Apply").count()) === 1);
  check(`${width}px: a company without links says so`, (await page.locator("li", { hasText: "Markopolo AI INC" }).getByText("No links yet").count()) === 0, "it has three");
  check(`${width}px: a company without links has "Add links" that names the company`, (await page.getByRole("button", { name: `Add links for ${LONG}` }).count()) === 1);
  check(`${width}px: the note is shown`, (await acme.getByText("Ask for Rahim in HR").count()) === 1);

  calls.length = 0;
  await page.getByRole("button", { name: "Edit Acme Inc" }).click();
  await page.getByRole("dialog").locator("#company-note").fill("New note");
  await page.getByRole("dialog").getByRole("button", { name: "Save company" }).click();
  await page.waitForTimeout(600);
  check(`${width}px: editing saves the changes`, calls[0]?.method === "PATCH" && calls[0].url === "/companies/c1" && calls[0].body.note === "New note", JSON.stringify(calls[0]));

  calls.length = 0;
  await page.getByRole("button", { name: "Delete Acme Inc" }).click();
  await page.getByRole("button", { name: "Delete company" }).click();
  await page.waitForTimeout(600);
  check(`${width}px: deleting asks first, then moves it to the Archive`, calls[0]?.method === "DELETE" && calls[0].url === "/companies/c1", JSON.stringify(calls[0]));

  calls.length = 0;
  await page.getByRole("button", { name: "Add Company" }).first().click();
  await page.waitForTimeout(100);
  check(`${width}px: a new company starts with the cursor in the name`, await page.locator("#company-name").evaluate((el) => el === document.activeElement));
  await page.getByRole("dialog").locator("#company-name").fill("Brand New Ltd");
  await page.getByRole("dialog").getByRole("button", { name: "Add company" }).click();
  await page.waitForTimeout(600);
  check(`${width}px: Add Company on the page saves a new one`, calls[0]?.method === "POST" && calls[0].body.name === "Brand New Ltd", JSON.stringify(calls[0]));

  if (wide) {
    // The sub-menu: "Company list" under "Job Apply" in the sidebar, highlighted on its page.
    const side = page.getByRole("complementary", { name: "Main menu" });
    const sub = side.getByRole("link", { name: "Company list" });
    check("the menu has Company list under Job Apply", (await sub.count()) === 1 && (await sub.getAttribute("aria-current")) === "page");
    check("and Job Apply itself is not marked as the page", (await side.getByRole("link", { name: "Job Apply" }).getAttribute("aria-current")) === null);
    const yJob = (await side.getByRole("link", { name: "Job Apply" }).boundingBox()).y;
    const ySub = (await sub.boundingBox()).y;
    const ySettings = (await side.getByRole("link", { name: "Settings" }).boundingBox()).y;
    check("it sits right under Job Apply and above Settings", ySub > yJob && ySub < ySettings, JSON.stringify({ yJob, ySub, ySettings }));
    await page.goto(`${BASE}/jobs`);
    check("on the Applications tab Job Apply is the marked page", (await side.getByRole("link", { name: "Job Apply" }).getAttribute("aria-current")) === "page" && (await sub.getAttribute("aria-current")) === null);
  }
  await ctx.close();
}

await browser.close();
console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
