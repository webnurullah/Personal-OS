// Browser check for Job Apply: the search box, the Calendar view after the Board (the Board stays), and the "Closing in 3 days" number.
// The built app must be running on http://localhost:3123.   Run:  node job-views-e2e.mjs
import { launch, newPhone, apiMock, measure, BASE, TODAY, session } from "/home/user/Personal-OS/dev-tools/browser-checks/audit-lib.mjs";

let failures = 0;
const check = (name, ok, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  → " + extra : ""}`);
};
const job = (id, title, over = {}) => ({ id, url: "", title, company: "Acme", location: "Dhaka", deadline: null, status: "saved", applied_on: null, summary: "", requirements: [], skills: [], notes: "", image_url: null, favourite: false, created_at: "2026-10-01T00:00:00Z", ...over });
// TODAY is 2026-10-06.
const jobs = [
  job("j1", "SEO Lead", { deadline: "2026-10-08", skills: ["SEO"] }), // closes in 2 days
  job("j2", "Social Media Manager", { deadline: "2026-10-11", company: "Beta Ltd" }), // 5 days
  job("j3", "Data Analyst", { deadline: "2026-10-30", skills: ["SQL"] }),
  job("j4", "Writer without a date"),
  job("j5", "Applied role", { status: "applied", applied_on: "2026-10-04", deadline: "2026-10-07" }),
  job("j6", "Rejected role", { status: "rejected", applied_on: "2026-09-20", deadline: "2026-09-25" }),
];
const browser = await launch();

for (const width of [390, 320, 1280]) {
  const wide = width >= 1000;
  const ctx = wide ? await browser.newContext({ viewport: { width, height: 900 } }) : await newPhone(browser, width);
  if (wide) await ctx.addCookies([{ name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), url: BASE }]);
  await apiMock(ctx, { "/jobs": { today: TODAY, items: jobs }, "/companies": { today: TODAY, items: [] } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/jobs`);
  await page.getByText("SEO Lead").first().waitFor();
  const stat = async (label) => (await page.getByText(label, { exact: true }).locator("xpath=following-sibling::*[1]").innerText()).trim();

  check(`${width}px: "Closing in 3 days" counts the saved jobs that close within 3 days (1), "Closing in 7 days" within 7 (2)`, (await stat("Closing in 3 days")) === "1" && (await stat("Closing in 7 days")) === "2", `${await stat("Closing in 3 days")} / ${await stat("Closing in 7 days")}`);
  const tabs = (await page.getByRole("tablist", { name: "View" }).getByRole("tab").allInnerTexts()).map((t) => t.trim());
  check(`${width}px: views are List, Board, Calendar (the Board stays)`, JSON.stringify(tabs) === JSON.stringify(["List", "Board", "Calendar"]), JSON.stringify(tabs));

  // search
  const search = page.getByRole("searchbox", { name: "Search jobs" });
  await search.fill("seo");
  check(`${width}px: the search narrows the list (title or skill)`, (await page.locator("article h3").allInnerTexts()).map((t) => t.trim()).join() === "SEO Lead");
  await search.fill("beta social");
  check(`${width}px: every word must match (company and title)`, (await page.locator("article h3").allInnerTexts()).map((t) => t.trim()).join() === "Social Media Manager");
  await search.fill("zzz nothing");
  check(`${width}px: no match says so, with a way to clear`, (await page.getByText("No job matches").count()) === 1 && (await page.getByRole("button", { name: "Clear the search" }).count()) === 1);
  await page.getByRole("button", { name: "Clear the search" }).click();
  check(`${width}px: clearing brings everything back`, (await page.locator("article h3").count()) === 6);

  // board keeps working and respects the search
  await page.getByRole("tab", { name: "Board" }).click();
  check(`${width}px: the Board still shows all five columns`, (await page.locator("section[aria-label='Rejected']").count()) === 1 && (await page.locator("section[aria-label='Saved']").count()) === 1);
  await search.fill("data");
  check(`${width}px: the search also narrows the Board`, (await page.locator("section[aria-label='Saved']").getByText("Data Analyst").count()) >= 1 && (await page.locator("section[aria-label]").getByText("SEO Lead").count()) === 0);
  await search.fill("");

  // calendar
  await page.getByRole("tab", { name: "Calendar" }).click();
  await page.getByText("October 2026", { exact: true }).waitFor();
  const cal = page.getByRole("region", { name: "Last days to apply" });
  check(`${width}px: the Calendar shows the month with the jobs on the day they close`, (await cal.getByRole("button", { name: /^SEO Lead$/ }).count()) === 1 && (await cal.getByRole("button", { name: /^Data Analyst$/ }).count()) === 1 && (await cal.getByRole("button", { name: /^Applied role$/ }).count()) === 1);
  check(`${width}px: jobs with no last date are listed under it`, (await cal.getByText("No last date (1)").count()) === 1);
  if (width <= 390) {
    const m = await measure(page, width);
    check(`${width}px: the Calendar does not widen the page (it scrolls inside its own box)`, !m.zoomedOut && m.mainClipped === 0, JSON.stringify(m));
  }
  await search.fill("seo");
  check(`${width}px: the search narrows the Calendar`, (await cal.getByRole("button", { name: /^Data Analyst$/ }).count()) === 0 && (await cal.getByRole("button", { name: /^SEO Lead$/ }).count()) === 1);
  await search.fill("");
  await cal.getByRole("button", { name: "Next month" }).click();
  check(`${width}px: the next month shows November and the October jobs are gone`, (await page.getByText("November 2026", { exact: true }).count()) === 1 && (await cal.getByRole("button", { name: /^SEO Lead$/ }).count()) === 0);
  await cal.getByRole("button", { name: "Today" }).click();
  await cal.getByRole("button", { name: /^SEO Lead$/ }).click();
  await page.locator("dialog[open]").waitFor();
  check(`${width}px: tapping a job in the Calendar opens it`, (await page.locator("dialog[open] input[value='SEO Lead']").count()) === 1);
  check(`${width}px: no page errors`, errors.length === 0, errors.join("; "));
  await ctx.close();
}
await browser.close();
console.log(failures ? `${failures} CHECK(S) FAILED` : "ALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
