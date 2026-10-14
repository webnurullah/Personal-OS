// Google Calendar: events turned into calendar days, the encrypted token, the signed sign-in state, and reading the calendars. Run with: npm test
import test from "node:test";
import assert from "node:assert/strict";
import { clockIn, normalizeGoogleEvent, safeColor, safeGoogleLink, sortGoogleEvents, type GoogleCalendarInfo, type RawGoogleEvent } from "../lib/google-calendar.ts";
import { authUrl, checkState, decryptToken, encryptToken, googleConfig, googleEvents, makeState, redirectUri, type GoogleConfig } from "../lib/server/google.ts";
import type { Db } from "../lib/server/supabase.ts";

const cal: GoogleCalendarInfo = { id: "main", name: "Main", color: "#4285f4" };
const norm = (raw: RawGoogleEvent, from = "2026-10-01", to = "2026-10-31", zone = "Asia/Dhaka") => normalizeGoogleEvent(raw, cal, zone, from, to);

test("a timed event is shown at your own clock time (Dhaka is 6 hours ahead of UTC)", () => {
  const [e, ...rest] = norm({ id: "a", summary: "Standup", start: { dateTime: "2026-10-14T03:00:00Z" }, end: { dateTime: "2026-10-14T03:30:00Z" } });
  assert.equal(rest.length, 0);
  assert.deepEqual([e.date, e.all_day, e.start_time, e.end_time, e.title], ["2026-10-14", false, "09:00", "09:30", "Standup"]);
  // The offset written in the event does not matter, only the moment.
  const other = norm({ id: "b", start: { dateTime: "2026-10-13T20:00:00-07:00" }, end: { dateTime: "2026-10-13T21:00:00-07:00" } });
  assert.deepEqual([other[0].date, other[0].start_time], ["2026-10-14", "09:00"]);
});

test("a late evening event lands on the next day in Dhaka", () => {
  const [e] = norm({ id: "c", start: { dateTime: "2026-10-14T19:30:00Z" }, end: { dateTime: "2026-10-14T20:30:00Z" } });
  assert.deepEqual([e.date, e.start_time, e.end_time], ["2026-10-15", "01:30", "02:30"]);
});

test("an all-day event ends the day before Google's (exclusive) end date", () => {
  assert.deepEqual(norm({ id: "d", summary: "Holiday", start: { date: "2026-10-20" }, end: { date: "2026-10-21" } }).map((e) => [e.date, e.all_day, e.start_time]), [["2026-10-20", true, null]]);
  assert.deepEqual(norm({ id: "e", start: { date: "2026-10-20" }, end: { date: "2026-10-23" } }).map((e) => e.date), ["2026-10-20", "2026-10-21", "2026-10-22"]);
  assert.deepEqual(norm({ id: "f", start: { date: "2026-10-20" } }).map((e) => e.date), ["2026-10-20"]);
});

test("an event that lasts several days is clipped to the days asked for", () => {
  const days = norm({ id: "g", start: { date: "2026-09-29" }, end: { date: "2026-10-04" } }, "2026-10-01", "2026-10-02");
  assert.deepEqual(days.map((e) => e.date), ["2026-10-01", "2026-10-02"]);
  assert.deepEqual(norm({ id: "h", start: { date: "2026-11-05" }, end: { date: "2026-11-06" } }).length, 0);
});

test("a timed event across midnight shows its time on the first day and 'all day' after", () => {
  const days = norm({ id: "i", start: { dateTime: "2026-10-14T16:00:00Z" }, end: { dateTime: "2026-10-15T08:00:00Z" } }); // 22:00 on the 14th to 14:00 on the 15th in Dhaka
  assert.deepEqual(days.map((e) => [e.date, e.all_day, e.start_time, e.end_time]), [["2026-10-14", false, "22:00", "23:59"], ["2026-10-15", true, null, null]]);
  // Ending exactly at midnight does not spill onto the next day.
  const exact = norm({ id: "j", start: { dateTime: "2026-10-14T16:00:00Z" }, end: { dateTime: "2026-10-14T18:00:00Z" } });
  assert.deepEqual(exact.map((e) => [e.date, e.end_time]), [["2026-10-14", "23:59"]]);
});

test("cancelled events, invitations you declined and broken events give nothing", () => {
  assert.equal(norm({ id: "k", status: "cancelled", start: { date: "2026-10-20" } }).length, 0);
  assert.equal(norm({ id: "l", start: { date: "2026-10-20" }, attendees: [{ self: true, responseStatus: "declined" }] }).length, 0);
  assert.equal(norm({ id: "m", start: { date: "2026-10-20" }, attendees: [{ self: false, responseStatus: "declined" }] }).length, 1);
  assert.equal(norm({ id: "n" }).length, 0);
  assert.equal(norm({ id: "o", start: { dateTime: "not a date" } }).length, 0);
  assert.equal(norm({ id: "p", start: { date: "2026-13-45x" } }).length, 0);
});

test("no title gets a name, long text is cut, and only links to Google are kept", () => {
  const [e] = norm({ id: "q", summary: "   ", location: "x".repeat(500), htmlLink: "https://www.google.com/calendar/event?eid=abc", start: { date: "2026-10-20" } });
  assert.equal(e.title, "(No title)");
  assert.equal(e.location.length, 200);
  assert.equal(e.link, "https://www.google.com/calendar/event?eid=abc");
  assert.equal(safeGoogleLink("javascript:alert(1)"), "");
  assert.equal(safeGoogleLink("https://evil.example/google.com"), "");
  assert.equal(safeGoogleLink("https://google.com.evil.example/x"), "");
  assert.equal(safeGoogleLink("http://www.google.com/x"), "");
});

test("calendar colours are only ever #rrggbb", () => {
  assert.equal(safeColor("#9FC6E7"), "#9fc6e7");
  assert.equal(safeColor("red; background:url(x)"), "#64748b");
  assert.equal(safeColor(undefined), "#64748b");
});

test("every day of an event has its own id, and a day reads all-day first, then by time", () => {
  const ids = norm({ id: "r", start: { date: "2026-10-20" }, end: { date: "2026-10-22" } }).map((e) => e.id);
  assert.equal(new Set(ids).size, 2);
  const sorted = sortGoogleEvents([
    ...norm({ id: "s1", summary: "B", start: { dateTime: "2026-10-20T08:00:00Z" }, end: { dateTime: "2026-10-20T09:00:00Z" } }),
    ...norm({ id: "s2", summary: "A", start: { dateTime: "2026-10-20T02:00:00Z" }, end: { dateTime: "2026-10-20T03:00:00Z" } }),
    ...norm({ id: "s3", summary: "Z", start: { date: "2026-10-20" } }),
  ]);
  assert.deepEqual(sorted.map((e) => e.title), ["Z", "A", "B"]);
});

test("the clock helper falls back for a time zone that does not exist", () => {
  assert.deepEqual(clockIn(new Date("2026-10-14T03:00:00Z"), "Nowhere/Land"), { date: "2026-10-14", time: "09:00" });
});

// ---- the token and the state ----

const config: GoogleConfig = { clientId: "id", clientSecret: "secret", key: "a-long-random-key-for-the-tests" };

test("the refresh token is stored encrypted, and only the right key opens it", () => {
  const stored = encryptToken("1//refresh-token", config.key);
  assert.ok(!stored.includes("refresh-token"));
  assert.equal(decryptToken(stored, config.key), "1//refresh-token");
  assert.equal(decryptToken(stored, "another-key-another-key"), null);
  assert.notEqual(encryptToken("1//refresh-token", config.key), stored, "a new random start every time");
  const tampered = stored.slice(0, -2) + (stored.endsWith("AA") ? "BB" : "AA");
  assert.equal(decryptToken(tampered, config.key), null);
  assert.equal(decryptToken("garbage", config.key), null);
  assert.equal(decryptToken("", config.key), null);
});

test("the sign-in state works for the same person within ten minutes, once signed", () => {
  const now = 1_800_000_000_000;
  const state = makeState("user-1", config.key, now);
  assert.equal(checkState(state, "user-1", config.key, now + 60_000), true);
  assert.equal(checkState(state, "user-2", config.key, now + 60_000), false, "another person");
  assert.equal(checkState(state, "user-1", config.key, now + 11 * 60_000), false, "too late");
  assert.equal(checkState(state, "user-1", "another-key-another-key", now), false, "other key");
  assert.equal(checkState(state.slice(0, -3) + "abc", "user-1", config.key, now), false, "changed");
  assert.equal(checkState("", "user-1", config.key, now), false);
  assert.equal(checkState("nodots", "user-1", config.key, now), false);
});

test("the setup is only on when all three values are there", () => {
  assert.equal(googleConfig({}), null);
  assert.equal(googleConfig({ GOOGLE_CLIENT_ID: "a", GOOGLE_CLIENT_SECRET: "b" }), null);
  assert.equal(googleConfig({ GOOGLE_CLIENT_ID: "a", GOOGLE_CLIENT_SECRET: "b", GOOGLE_TOKEN_KEY: "short" }), null, "a short key is refused");
  assert.deepEqual(googleConfig({ GOOGLE_CLIENT_ID: " a ", GOOGLE_CLIENT_SECRET: "b", GOOGLE_TOKEN_KEY: "0123456789abcdef" }), { clientId: "a", clientSecret: "b", key: "0123456789abcdef" });
});

test("Google's page asks for read-only calendar access and a long-lasting link", () => {
  const url = new URL(authUrl(config, "https://pos.nurullah.com.bd/settings/google", "STATE"));
  assert.equal(url.origin + url.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(url.searchParams.get("scope"), "openid email https://www.googleapis.com/auth/calendar.readonly");
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("prompt"), "consent");
  assert.equal(url.searchParams.get("state"), "STATE");
  assert.equal(url.searchParams.get("redirect_uri"), "https://pos.nurullah.com.bd/settings/google");
  assert.ok(![...url.searchParams.values()].some((v) => v.includes("calendar ") || v.endsWith("/auth/calendar")), "never the read-write scope");
});

test("the return address follows the website the person is on", () => {
  assert.equal(redirectUri(new Headers({ host: "pos.nurullah.com.bd", "x-forwarded-proto": "https" }), {}), "https://pos.nurullah.com.bd/settings/google");
  assert.equal(redirectUri(new Headers({ "x-forwarded-host": "pos.nurullah.com.bd, other" }), {}), "https://pos.nurullah.com.bd/settings/google");
  assert.equal(redirectUri(new Headers({ host: "localhost:3000" }), {}), "http://localhost:3000/settings/google");
  assert.equal(redirectUri(new Headers({ host: "x.vercel.app" }), { GOOGLE_REDIRECT_URI: "https://fixed.example/settings/google" }), "https://fixed.example/settings/google");
});

// ---- reading the calendars ----

type Row = { refresh_token_enc: string; status: string };
function fakeDb(row: Row | null) {
  const updates: unknown[] = [];
  const db = {
    from: () => ({
      select: () => ({ maybeSingle: () => Promise.resolve({ data: row, error: null }) }),
      update: (values: unknown) => ({ eq: () => { updates.push(values); return Promise.resolve({ error: null }); } }),
    }),
  } as unknown as Db;
  return { db, updates };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function googleStub(handlers: { calendars?: unknown; events?: Record<string, unknown | Response>; token?: () => Response }) {
  const calls: string[] = [];
  const fetchFn = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    if (url.startsWith("https://oauth2.googleapis.com/token")) return handlers.token ? handlers.token() : json({ access_token: "access-1", expires_in: 3600 });
    if (url.includes("/calendarList")) return json(handlers.calendars ?? { items: [] });
    const id = decodeURIComponent(url.split("/calendars/")[1].split("/events")[0]);
    const out = handlers.events?.[id];
    return out instanceof Response ? out : json(out ?? { items: [] });
  }) as typeof fetch;
  return { fetchFn, calls };
}

const stored = () => ({ refresh_token_enc: encryptToken("refresh-1", config.key), status: "ok" });
const day = (id: string, summary: string, date: string) => ({ id, summary, start: { date }, end: { date: new Date(Date.parse(date) + 86400000).toISOString().slice(0, 10) } });

test("every selected calendar is read, hidden ones are not, and the events come in order", async () => {
  const { db } = fakeDb(stored());
  const { fetchFn, calls } = googleStub({
    calendars: { items: [{ id: "main", summary: "Me", backgroundColor: "#4285f4", selected: true }, { id: "work", summary: "Work", summaryOverride: "Office", backgroundColor: "#0b8043" }, { id: "hidden", summary: "Hidden", hidden: true }, { id: "off", summary: "Off", selected: false }] },
    events: { main: { items: [day("1", "Dentist", "2026-10-20")] }, work: { items: [day("2", "Review", "2026-10-14")] } },
  });
  const result = await googleEvents(db, "u-order", "Asia/Dhaka", "2026-10-01", "2026-10-31", { config, fetchFn, now: 1_000_000 });
  assert.equal(result.status, "ok");
  assert.deepEqual(result.events.map((e) => [e.date, e.title, e.calendar, e.color]), [["2026-10-14", "Review", "Office", "#0b8043"], ["2026-10-20", "Dentist", "Me", "#4285f4"]]);
  assert.equal(calls.filter((c) => c.includes("/events")).length, 2, "only the two shown calendars");
  const eventsCall = new URL(calls.find((c) => c.includes("/calendars/main/events"))!);
  assert.equal(eventsCall.searchParams.get("singleEvents"), "true", "repeating events are expanded by Google");
});

test("a second look soon after uses what was read (no new call to Google)", async () => {
  const { db } = fakeDb(stored());
  const { fetchFn, calls } = googleStub({ calendars: { items: [{ id: "main", summary: "Me" }] }, events: { main: { items: [day("1", "A", "2026-10-20")] } } });
  const deps = { config, fetchFn, now: 5_000_000 };
  await googleEvents(db, "u-cache", "Asia/Dhaka", "2026-10-01", "2026-10-31", deps);
  const first = calls.length;
  const again = await googleEvents(db, "u-cache", "Asia/Dhaka", "2026-10-01", "2026-10-31", { ...deps, now: 5_000_000 + 60_000 });
  assert.equal(calls.length, first);
  assert.equal(again.events.length, 1);
  await googleEvents(db, "u-cache", "Asia/Dhaka", "2026-10-01", "2026-10-31", { ...deps, now: 5_000_000 + 10 * 60_000 });
  assert.ok(calls.length > first, "after a few minutes it asks again");
});

test("one calendar failing does not hide the others", async () => {
  const { db } = fakeDb(stored());
  const { fetchFn } = googleStub({
    calendars: { items: [{ id: "main", summary: "Me" }, { id: "shared", summary: "Shared" }] },
    events: { main: { items: [day("1", "Kept", "2026-10-20")] }, shared: json({ error: { message: "Not Found", status: "NOT_FOUND" } }, 404) },
  });
  const result = await googleEvents(db, "u-partial", "Asia/Dhaka", "2026-10-01", "2026-10-31", { config, fetchFn, now: 9_000_000 });
  assert.equal(result.status, "ok");
  assert.deepEqual(result.events.map((e) => e.title), ["Kept"]);
});

test("when Google no longer accepts the link it is remembered, and the calendar still loads", async () => {
  const { db, updates } = fakeDb(stored());
  const { fetchFn } = googleStub({ token: () => json({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, 400) });
  const result = await googleEvents(db, "u-revoked", "Asia/Dhaka", "2026-10-01", "2026-10-31", { config, fetchFn, now: 12_000_000 });
  assert.deepEqual(result, { status: "reconnect", events: [] });
  assert.deepEqual(updates, [{ status: "reconnect" }]);
  // A link that is already marked is not tried again.
  const marked = fakeDb({ ...stored(), status: "reconnect" });
  const noCalls = googleStub({});
  assert.equal((await googleEvents(marked.db, "u-marked", "Asia/Dhaka", "2026-10-01", "2026-10-31", { config, fetchFn: noCalls.fetchFn })).status, "reconnect");
  assert.equal(noCalls.calls.length, 0);
});

test("Google being down, slow or answering badly gives 'error' (never an exception)", async () => {
  const { db } = fakeDb(stored());
  const down = (async () => { throw new Error("network"); }) as unknown as typeof fetch;
  assert.deepEqual(await googleEvents(db, "u-down", "Asia/Dhaka", "2026-10-01", "2026-10-31", { config, fetchFn: down, now: 15_000_000 }), { status: "error", events: [] });
  const bad = googleStub({ calendars: { items: [{ id: "main", summary: "Me" }] }, events: { main: json({ error: { message: "Backend Error", status: "INTERNAL" } }, 500) } });
  assert.equal((await googleEvents(db, "u-bad", "Asia/Dhaka", "2026-10-01", "2026-10-31", { config, fetchFn: bad.fetchFn, now: 18_000_000 })).status, "error");
});

test("not connected, or not set up on the server: nothing is asked of Google", async () => {
  const none = googleStub({});
  assert.deepEqual(await googleEvents(fakeDb(null).db, "u-off", "Asia/Dhaka", "2026-10-01", "2026-10-31", { config, fetchFn: none.fetchFn }), { status: "off", events: [] });
  assert.deepEqual(await googleEvents(fakeDb(stored()).db, "u-unset", "Asia/Dhaka", "2026-10-01", "2026-10-31", { config: null, fetchFn: none.fetchFn }), { status: "off", events: [] });
  assert.equal(none.calls.length, 0);
});

test("a saved token that cannot be opened (the key was changed) asks to connect again", async () => {
  const wrongKey = fakeDb({ refresh_token_enc: encryptToken("x", "some-other-long-key-123"), status: "ok" });
  const { fetchFn, calls } = googleStub({});
  const result = await googleEvents(wrongKey.db, "u-key", "Asia/Dhaka", "2026-10-01", "2026-10-31", { config, fetchFn, now: 21_000_000 });
  assert.equal(result.status, "reconnect");
  assert.equal(calls.length, 0);
  assert.deepEqual(wrongKey.updates, [{ status: "reconnect" }]);
});
