// Browser check for Google Calendar in the Calendar page and in Settings → Integrations (stand-in API, no real Google).
// The built app must be running on http://localhost:3123.   Run:  node google-calendar-e2e.mjs   (SHOTS=<folder> saves pictures)
import { launch, newPhone, apiMock, measure, BASE, TODAY, session } from "/home/user/Personal-OS/dev-tools/browser-checks/audit-lib.mjs";

let failures = 0;
const check = (name, ok, extra = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  → " + extra : ""}`);
};

const g = (id, date, title, over = {}) => ({ id: `${id}@main@${date}`, date, title, all_day: false, start_time: "09:00", end_time: "10:00", location: "", link: `https://www.google.com/calendar/event?eid=${id}`, calendar: "Me", color: "#4285f4", ...over });
const LONG = "A very long Google event title that has to be cut short so that it cannot push the phone layout wider than the screen ".repeat(2);
const google = [
  g("a", TODAY, "Dentist", { start_time: "09:30", location: "Dhanmondi Clinic" }),
  g("b", TODAY, "Holiday", { all_day: true, start_time: null, end_time: null, calendar: "Holidays", color: "#0b8043", link: "" }),
  g("c", TODAY, LONG, { start_time: "15:00", calendar: "Work", color: "#d50000" }),
  g("d", TODAY, "Third", { start_time: "16:00" }),
  g("e", "2026-10-20", "Later in the month", { calendar: "Work", color: "#d50000" }),
];
const mine = [{ id: "m1", date: TODAY, title: "My own event", all_day: false, start_time: "08:00", end_time: "09:00", repeat: "none", repeat_until: null, category_id: null, note: "", event_date: TODAY }];
const browser = await launch();

for (const width of [390, 320, 1280]) {
  const wide = width >= 1000;
  const mk = async () => {
    const ctx = wide ? await browser.newContext({ viewport: { width, height: 900 } }) : await newPhone(browser, width);
    if (wide) await ctx.addCookies([{ name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), url: BASE }]);
    return ctx;
  };
  let ctx = await mk();
  let status = "ok";
  await apiMock(ctx, { "/events": () => ({ today: TODAY, from: "2026-09-28", to: "2026-11-08", items: mine, google: status === "off" ? [] : google, google_status: status }) });
  let page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${BASE}/calendar`);
  await page.getByRole("heading", { name: "Calendar", level: 1 }).waitFor();
  await page.getByRole("button", { name: /Add an event on this day/ }).waitFor();

  // ---- the grid
  const cell = page.getByRole("button", { name: new RegExp(`4 Google events`) });
  check(`${width}px: today's cell says how many Google events it holds`, (await cell.count()) === 1);
  if (wide) {
    check(`${width}px: the cell shows two Google chips and "+2 Google"`, (await cell.getByText("Dentist").count()) === 1 && (await cell.getByText("+2 Google").count()) === 1);
    check(`${width}px: your own event is still in the cell`, (await cell.getByText("My own event").count()) === 1);
  } else {
    check(`${width}px: on a phone the Google events are small dots in their own colours`, (await cell.locator("span.rounded-full[style*='background-color']").count()) === 3);
  }

  // ---- the day's list
  const agenda = page.locator("section", { has: page.getByText("Google Calendar", { exact: true }) });
  await agenda.first().waitFor();
  const dentist = page.getByRole("link", { name: /Dentist, open in Google Calendar/ });
  check(`${width}px: the day lists the Google events under "Google Calendar"`, (await agenda.getByText("Holiday", { exact: true }).count()) === 1 && (await dentist.count()) === 1);
  check(`${width}px: a Google event opens in Google Calendar in a new tab, safely`, (await dentist.getAttribute("href")) === "https://www.google.com/calendar/event?eid=a" && (await dentist.getAttribute("target")) === "_blank" && /noopener/.test((await dentist.getAttribute("rel")) ?? ""));
  check(`${width}px: it shows the time, the calendar and the place`, (await agenda.getByText("Me · Dhanmondi Clinic").count()) === 1 && (await agenda.getByText("9:30 AM").count()) >= 1);
  check(`${width}px: an event with no link is not a link`, (await page.getByRole("link", { name: /Holiday/ }).count()) === 0);
  check(`${width}px: your own events are still opened in the editor`, (await page.getByRole("button", { name: /My own event/ }).count()) >= 1);
  let m = await measure(page, width);
  check(`${width}px: no overflow with a very long Google title`, !m.zoomedOut && m.mainClipped === 0 && m.offenders.length === 0, JSON.stringify(m));
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/google-calendar-${width}.png`, fullPage: true });

  // ---- coming up lists them with your own
  const upcoming = page.locator("section", { has: page.getByRole("heading", { name: "Coming up" }) });
  check(`${width}px: "Coming up" includes the Google events`, (await upcoming.getByText("Later in the month").count()) === 1);

  // ---- hide and show
  const toggle = page.getByRole("switch", { name: "Show Google Calendar events" });
  check(`${width}px: a switch shows or hides them`, (await toggle.getAttribute("aria-checked")) === "true");
  await toggle.click();
  check(`${width}px: hidden: no Google events in the day, the grid or Coming up`, (await dentist.count()) === 0 && (await page.getByRole("button", { name: /Google events/ }).count()) === 0 && (await upcoming.getByText("Later in the month").count()) === 0);
  await page.reload();
  await page.getByRole("switch", { name: "Show Google Calendar events" }).waitFor();
  check(`${width}px: the choice is remembered on this device`, (await page.getByRole("switch", { name: "Show Google Calendar events" }).getAttribute("aria-checked")) === "false");
  await page.getByRole("switch", { name: "Show Google Calendar events" }).click();
  check(`${width}px: and showing them again brings them back`, (await dentist.count()) === 1);

  // ---- a Google problem never hides your own events
  for (const [state, text] of [["reconnect", /needs to be connected again/], ["error", /could not be reached just now/]]) {
    status = state;
    await page.reload();
    await page.getByRole("button", { name: /Add an event on this day/ }).waitFor();
    check(`${width}px: status "${state}" shows a notice and keeps your own events`, (await page.getByText(text).count()) === 1 && (await page.getByRole("button", { name: /My own event/ }).count()) >= 1);
  }
  status = "off";
  await page.reload();
  await page.getByRole("button", { name: /Add an event on this day/ }).waitFor();
  check(`${width}px: not connected: no Google switch, no notice, no Google section`, (await page.getByRole("switch", { name: "Show Google Calendar events" }).count()) === 0 && (await page.getByText("Google Calendar", { exact: true }).count()) === 0 && (await page.getByText(/Google Calendar (needs|could not)/).count()) === 0);
  check(`${width}px: no page errors on the calendar`, errors.length === 0, errors.join("; "));
  await ctx.close();

  // ---- Settings → Integrations, and the page Google sends you back to
  ctx = await mk();
  let google_state = { configured: false, connected: false, email: "", status: "off", connected_at: null };
  const calls = [];
  await apiMock(ctx, {
    "/google/status": () => google_state,
    "/google/connect": () => (calls.push("connect"), { url: `${BASE}/settings/google?code=abc&state=xyz` }),
    "/google/link": (method) => (calls.push(`link ${method}`), { ok: true, email: "me@gmail.com" }),
    "/google/disconnect": () => (calls.push("disconnect"), (google_state = { ...google_state, connected: false, email: "", status: "off" }), { ok: true }),
  });
  page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  const open = async () => {
    await page.goto(`${BASE}/settings?tab=integrations`);
    await page.getByRole("heading", { name: "Google Calendar" }).waitFor();
  };
  await open();
  check(`${width}px: not set up on the server: it says which three values to add, and offers no Connect button`, (await page.getByText("Not set up on the server yet").count()) === 1 && (await page.getByText("GOOGLE_TOKEN_KEY").count()) === 1 && (await page.getByRole("button", { name: /Connect Google Calendar/ }).count()) === 0);
  m = await measure(page, width);
  check(`${width}px: Settings → Integrations fits the screen`, !m.zoomedOut && m.mainClipped === 0 && m.offenders.length === 0, JSON.stringify(m));
  google_state = { ...google_state, configured: true };
  await open();
  check(`${width}px: set up but not connected: a Connect button`, (await page.getByRole("button", { name: "Connect Google Calendar" }).count()) === 1);
  await page.getByRole("button", { name: "Connect Google Calendar" }).click();
  await page.waitForFunction(() => location.pathname === "/settings/google", null, { timeout: 8000 }).catch(() => undefined);
  for (let i = 0; i < 40 && !calls.includes("link POST"); i++) await page.waitForTimeout(100);
  await page.waitForFunction(() => location.pathname === "/settings" && location.search.includes("integrations"), null, { timeout: 8000 });
  check(`${width}px: Connect goes to Google's page, and coming back finishes the link and returns to Settings`, calls.join() === "connect,link POST" && page.url().includes("tab=integrations"), calls.join());
  google_state = { configured: true, connected: true, email: "me@gmail.com", status: "ok", connected_at: "2026-10-14T05:00:00Z" };
  await open();
  check(`${width}px: connected: shows the account and Disconnect`, (await page.getByText(/Connected as me@gmail.com/).count()) === 1 && (await page.getByRole("button", { name: "Disconnect" }).count()) === 1);
  await page.getByRole("button", { name: "Disconnect" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Disconnect" }).click();
  await page.getByRole("button", { name: "Connect Google Calendar" }).waitFor();
  check(`${width}px: Disconnect asks first, then goes back to "Connect"`, calls.includes("disconnect"));
  google_state = { configured: true, connected: true, email: "me@gmail.com", status: "reconnect", connected_at: "2026-10-14T05:00:00Z" };
  await open();
  check(`${width}px: link no longer accepted: says so and offers "Connect again"`, (await page.getByText(/no longer accepts the link/).count()) === 1 && (await page.getByRole("button", { name: "Connect again" }).count()) === 1);

  // The page Google sends you back to, when Google refuses or it is opened by hand.
  await page.goto(`${BASE}/settings/google?error=access_denied`);
  await page.getByText("Google Calendar was not connected").waitFor();
  check(`${width}px: if you press "Cancel" at Google, it says nothing was connected`, (await page.getByText(/was not allowed/).count()) === 1 && (await page.getByRole("link", { name: "Back to Settings" }).count()) === 1);
  await page.goto(`${BASE}/settings/google`);
  await page.getByText("Google Calendar was not connected").waitFor();
  check(`${width}px: opened by hand, it explains and links back`, (await page.getByText(/meant to be opened by Google/).count()) === 1);
  check(`${width}px: no page errors in Settings`, errors.length === 0, errors.join("; "));
  await ctx.close();
}
await browser.close();
console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
process.exit(failures ? 1 : 0);
