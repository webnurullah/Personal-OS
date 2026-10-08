import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
const base = "http://localhost:3123", T = "2026-10-06";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const now = Math.floor(Date.now() / 1000);
const session = { access_token: "x.y.z", refresh_token: "r", token_type: "bearer", expires_in: 99999999, expires_at: now + 99999999, user: { id: "u1", aud: "authenticated", email: "me@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01" } };
const profile = { id: "u1", email: "me@example.com", today: T, full_name: "Nurullah", currency: "BDT", time_format: "12h", timezone: "Asia/Dhaka", week_start: 1, hide_amounts: false, skills: [], notify: {}, avatar_url: null };
const course = { id: "c1", title: "Digital Marketing", subtitle: "Learning Digital Marketing", quote: "", start_date: "2026-09-28", target_date: "2026-12-31", weekly_plan: [], color: "blue" };
const unit = { id: "u1", course_id: "c1", code: "1", title: "Google Ads", color: "blue", position: 0, topics: [] };
const pages = process.argv[2] ? process.argv[2].split(",") : ["/tasks", "/archive", "/settings", "/learning/c1"];
const hide = process.argv[3] === "hide-drawer";
for (const path of pages) {
  const ctx = await browser.newContext({ viewport: { width: 450, height: 980 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.addCookies([{ name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), url: base }]);
  await ctx.route("**/api/**", (route) => {
    const u = new URL(route.request().url()), p = u.pathname.replace("/api", "");
    if (p === "/assistant") return route.fulfill({ json: { ai: false } });
    if (p === "/profile") return route.fulfill({ json: profile });
    if (p === "/courses/c1") return route.fulfill({ json: { today: T, course, units: [unit] } });
    if (p === "/notifications") return route.fulfill({ json: { items: [], unread: 0 } });
    return route.fulfill({ json: { items: [], today: T } });
  });
  const page = await ctx.newPage();
  if (hide) await page.addInitScript(() => { const s = document.createElement("style"); s.textContent = "aside[aria-label='Main menu']{display:none!important}"; document.addEventListener("DOMContentLoaded", () => document.head.append(s)); });
  await page.goto(base + path);
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => ({ innerWidth: window.innerWidth, visualWidth: Math.round(window.visualViewport.width), docW: document.documentElement.scrollWidth }));
  console.log(path.padEnd(14), hide ? "(drawer hidden)" : "", JSON.stringify(r));
  await ctx.close();
}
await browser.close();
