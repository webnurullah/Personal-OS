// Shared helper for the phone-layout audit. The app (production build) is already running on http://localhost:3123.
// Usage in your own script:
//   import { chromium, session, newPhone, apiMock, measure } from "/tmp/claude-0/-home-user-Personal-OS/2c2f8a59-52e5-53a4-9940-d366d1b5c600/scratchpad/audit/audit-lib.mjs";
export { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";

export const BASE = "http://localhost:3123";
export const TODAY = "2026-10-06";
export const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
export const launch = () => chromium.launch({ executablePath: CHROME });

const now = Math.floor(Date.now() / 1000);
// A fake signed-in browser session. The app only needs this cookie; the API is answered by apiMock() below.
export const session = { access_token: "x.y.z", refresh_token: "r", token_type: "bearer", expires_in: 99999999, expires_at: now + 99999999, user: { id: "u1", aud: "authenticated", email: "me@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
export const profile = { id: "u1", email: "me@example.com", today: TODAY, full_name: "Nurullah", tagline: "Every Day", city: "Dhaka", currency: "BDT", time_format: "12h", timezone: "Asia/Dhaka", week_start: 1, hide_amounts: false, weekly_study_goal: 8, step_goal: 10000, sleep_goal_minutes: 480, water_goal: 8, skills: ["React", "Git"], notify: {}, avatar_url: null };

/**
 * A phone as Chrome on Android sees it: a mobile viewport (isMobile) so the page can be shrunk to fit wide content,
 * which is exactly the failure being hunted. width is in CSS pixels (320, 360, 390, 412, 450 are typical).
 */
export async function newPhone(browser, width = 390, height = 844) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.addCookies([{ name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), url: BASE }]);
  return ctx;
}

/**
 * Answers every /api call. `fixtures` maps an API path (without /api, with the ?query if you want to match it exactly)
 * to a JSON body, or to a function (method, url) => body. Anything not listed gets an empty list shaped like { items: [], today }.
 * Look at web/lib/types.ts for the shapes the pages expect and web/app/api/(name)/route.ts for what each endpoint returns.
 */
export async function apiMock(ctx, fixtures = {}) {
  await ctx.route("**/api/**", async (route) => {
    const req = route.request(), u = new URL(req.url()), path = u.pathname.replace("/api", ""), full = path + u.search;
    const hit = fixtures[full] ?? fixtures[path];
    if (hit !== undefined) return route.fulfill({ json: typeof hit === "function" ? hit(req.method(), u) : hit });
    if (path === "/assistant") return route.fulfill({ json: { ai: false } });
    if (path === "/profile") return route.fulfill({ json: profile });
    if (path === "/notifications") return route.fulfill({ json: { items: [], unread: 0 } });
    if (req.method() !== "GET") return route.fulfill({ json: { ok: true } });
    return route.fulfill({ json: { items: [], today: TODAY } });
  });
}

/**
 * Measures a loaded page. Run it AFTER the content has appeared.
 *  - layoutWidth: window.innerWidth. On a phone this must equal the device width. If it is bigger, the whole page gets
 *    zoomed out (the bug the owner reported: everything tiny, blank area on the right).
 *  - docWidth: documentElement.scrollWidth (must not exceed the device width).
 *  - mainClipped: how many px wider than the screen the content of <main> is (main hides sideways overflow with overflow-x: clip,
 *    so this is where an overflow shows up now). Must be 0, except content that sits inside its own scroller.
 *  - offenders: elements of the page (not the closed menu drawer, not inside a scrolling box) that stick out past the right edge.
 */
export async function measure(page, width) {
  return page.evaluate((deviceWidth) => {
    const inScroller = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if ((o === "auto" || o === "scroll" || o === "hidden") && p.tagName !== "MAIN") return true; } return false; };
    const main = document.querySelector("main");
    const offenders = [...document.querySelectorAll("body *")]
      .filter((el) => !el.closest("aside[aria-label='Main menu']") && !el.closest("dialog:not([open])") && !el.closest("[data-nextjs-toast]") && !el.closest("nextjs-portal"))
      .map((el) => ({ el, r: el.getBoundingClientRect(), cs: getComputedStyle(el) }))
      .filter(({ r, cs }) => r.width > 0 && cs.visibility !== "hidden" && cs.display !== "none" && r.right > deviceWidth + 1 && cs.position !== "fixed")
      .filter(({ el }) => !inScroller(el))
      .slice(0, 15)
      .map(({ el, r }) => `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}.${String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className).trim().replace(/\s+/g, ".").slice(0, 80)} right=${Math.round(r.right)} width=${Math.round(r.width)} text="${(el.textContent || "").trim().slice(0, 30)}"`);
    return {
      layoutWidth: window.innerWidth,
      zoomedOut: window.innerWidth > deviceWidth + 1,
      docWidth: document.documentElement.scrollWidth,
      mainClipped: main ? Math.max(0, main.scrollWidth - main.clientWidth) : null,
      offenders,
    };
  }, width);
}
