// Google Calendar, server side: the link to a Google account (OAuth), the encrypted refresh token, and reading the calendars.
// Read-only: the only permission asked for is "see your calendars" (calendar.readonly) and your email address.
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { safeColor, sortGoogleEvents, normalizeGoogleEvent, type GoogleCalendarInfo, type GoogleEvent, type GoogleStatus, type RawGoogleEvent } from "../google-calendar.ts";
import { HttpError } from "./http.ts";
import type { Db } from "./supabase.ts";

export const GOOGLE_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/calendar.readonly"];
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const API = "https://www.googleapis.com/calendar/v3";
const REQUEST_TIMEOUT_MS = 8000;
const MAX_CALENDARS = 25;
const MAX_EVENTS_PER_CALENDAR = 500;
const EVENTS_TTL_MS = 2 * 60 * 1000;
const STATE_TTL_MS = 10 * 60 * 1000;

type Fetch = typeof fetch;
export type GoogleConfig = { clientId: string; clientSecret: string; key: string };

/** The three values from Vercel; null while any is missing (the calendar then works as before, without Google). */
export function googleConfig(env: Record<string, string | undefined> = process.env): GoogleConfig | null {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  const key = env.GOOGLE_TOKEN_KEY?.trim();
  return clientId && clientSecret && key && key.length >= 16 ? { clientId, clientSecret, key } : null;
}

export function requireGoogle(): GoogleConfig {
  const config = googleConfig();
  if (!config) throw new HttpError(503, "Google Calendar is not set up yet. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_TOKEN_KEY in Vercel (Settings → Environment Variables), then redeploy.");
  return config;
}

// ---- the token is kept encrypted (AES-256-GCM); the state of a sign-in is signed (HMAC) ----

const keyBytes = (secret: string, purpose: string) => createHash("sha256").update(`${purpose}:${secret}`).digest();

export function encryptToken(plain: string, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(secret, "token"), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

/** The token, or null when it was made with another key or was changed. */
export function decryptToken(stored: string, secret: string) {
  const [version, iv, tag, data] = stored.split(".");
  if (version !== "v1" || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", keyBytes(secret, "token"), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

const sign = (text: string, secret: string) => createHmac("sha256", keyBytes(secret, "state")).update(text).digest("base64url");

/** Goes to Google and comes back: proves the person who comes back is the one who started, within ten minutes. */
export function makeState(userId: string, secret: string, now: number) {
  const body = `${userId}.${now + STATE_TTL_MS}.${randomBytes(8).toString("base64url")}`;
  return `${body}.${sign(body, secret)}`;
}

export function checkState(state: string, userId: string, secret: string, now: number) {
  const cut = state.lastIndexOf(".");
  if (cut < 1) return false;
  const body = state.slice(0, cut);
  const given = Buffer.from(state.slice(cut + 1));
  const wanted = Buffer.from(sign(body, secret));
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) return false;
  const [id, expires] = body.split(".");
  return id === userId && Number(expires) > now;
}

export function authUrl(config: GoogleConfig, redirectUri: string, state: string) {
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline", // a refresh token, so the link keeps working
    prompt: "consent", // ... and one is given again every time
    include_granted_scopes: "true",
    state,
  }).toString();
  return url.toString();
}

// ---- talking to Google ----

class GoogleError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function call(fetchFn: Fetch, url: string, init: RequestInit = {}) {
  const res = await fetchFn(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    const nested = body?.error as { message?: string; status?: string } | string | undefined;
    const code = typeof nested === "string" ? nested : (nested?.status ?? "");
    const message = typeof nested === "object" ? (nested?.message ?? "") : String(body?.error_description ?? nested ?? "");
    throw new GoogleError(message || `Google answered ${res.status}`, res.status, code);
  }
  return body ?? {};
}

const form = (values: Record<string, string>) => ({ method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(values).toString() });

/** The code Google sent back, exchanged for a refresh token and the Google account's email. */
export async function exchangeCode(config: GoogleConfig, code: string, redirectUri: string, fetchFn: Fetch = fetch) {
  const token = await call(fetchFn, TOKEN_URL, form({ code, client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" })).catch((e) => {
    if (e instanceof GoogleError && e.code === "invalid_grant") throw new HttpError(400, "That Google sign-in has expired. Press Connect again.");
    throw new HttpError(502, `Google would not finish the connection (${e instanceof Error ? e.message : "no answer"}). Check the client ID, the secret and the redirect address.`);
  });
  const access = String(token.access_token ?? "");
  const refresh = String(token.refresh_token ?? "");
  const scope = String(token.scope ?? "");
  if (!refresh) throw new HttpError(400, "Google did not give a long-lasting link. Remove this app at myaccount.google.com/permissions, then press Connect again.");
  if (!scope.includes("calendar.readonly")) throw new HttpError(400, "Calendar access was not allowed. Press Connect again and tick the calendar permission.");
  let email = "";
  try {
    email = String((await call(fetchFn, USERINFO_URL, { headers: { authorization: `Bearer ${access}` } })).email ?? "");
  } catch {
    // The email is only shown in Settings.
  }
  return { refresh, access, expiresIn: Number(token.expires_in ?? 3600), scope, email };
}

// An access token lasts an hour; keeping it in memory saves a call to Google for each month on screen.
const accessTokens = new Map<string, { token: string; until: number }>();
const eventsCache = new Map<string, { at: number; events: GoogleEvent[] }>();

export function forgetGoogle(userId: string) {
  accessTokens.delete(userId);
  for (const key of eventsCache.keys()) if (key.startsWith(`${userId}|`)) eventsCache.delete(key);
}

async function accessTokenFor(config: GoogleConfig, userId: string, refreshToken: string, fetchFn: Fetch, now: number) {
  const hit = accessTokens.get(userId);
  if (hit && hit.until > now) return hit.token;
  const token = await call(fetchFn, TOKEN_URL, form({ client_id: config.clientId, client_secret: config.clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" }));
  const access = String(token.access_token ?? "");
  if (!access) throw new GoogleError("No access token", 502, "");
  accessTokens.set(userId, { token: access, until: now + Math.max(60, Number(token.expires_in ?? 3600) - 300) * 1000 });
  return access;
}

async function calendarsOf(access: string, fetchFn: Fetch): Promise<GoogleCalendarInfo[]> {
  const body = await call(fetchFn, `${API}/users/me/calendarList?minAccessRole=reader&maxResults=${MAX_CALENDARS}&fields=items(id,summary,summaryOverride,backgroundColor,selected,hidden,deleted)`, { headers: { authorization: `Bearer ${access}` } });
  const items = (body.items ?? []) as { id?: string; summary?: string; summaryOverride?: string; backgroundColor?: string; selected?: boolean; hidden?: boolean; deleted?: boolean }[];
  return items
    .filter((c) => c.id && !c.hidden && !c.deleted && c.selected !== false)
    .slice(0, MAX_CALENDARS)
    .map((c) => ({ id: c.id!, name: (c.summaryOverride || c.summary || c.id!).slice(0, 100), color: safeColor(c.backgroundColor) }));
}

async function eventsOf(access: string, calendar: GoogleCalendarInfo, zone: string, from: string, to: string, fetchFn: Fetch) {
  // A day of margin each side: the time zone of the calendar may differ from yours.
  const min = new Date(`${from}T00:00:00Z`).getTime() - 24 * 3600000;
  const max = new Date(`${to}T00:00:00Z`).getTime() + 48 * 3600000;
  const url = new URL(`${API}/calendars/${encodeURIComponent(calendar.id)}/events`);
  url.search = new URLSearchParams({
    singleEvents: "true", // repeating events come as one event per day
    orderBy: "startTime",
    timeMin: new Date(min).toISOString(),
    timeMax: new Date(max).toISOString(),
    maxResults: String(MAX_EVENTS_PER_CALENDAR),
    fields: "items(id,status,summary,location,htmlLink,start,end,attendees(self,responseStatus))",
  }).toString();
  const body = await call(fetchFn, url.toString(), { headers: { authorization: `Bearer ${access}` } });
  return ((body.items ?? []) as RawGoogleEvent[]).flatMap((raw) => normalizeGoogleEvent(raw, calendar, zone, from, to));
}

export type GoogleResult = { status: GoogleStatus; events: GoogleEvent[] };

/**
 * Your Google events from..to. Never throws: when Google cannot be reached the calendar still works, and the status says why.
 * (`reconnect` = Google no longer accepts the link; it is also remembered in the database so Settings can say so.)
 */
export async function googleEvents(db: Db, userId: string, zone: string, from: string, to: string, deps: { config?: GoogleConfig | null; fetchFn?: Fetch; now?: number } = {}): Promise<GoogleResult> {
  const config = deps.config === undefined ? googleConfig() : deps.config;
  if (!config) return { status: "off", events: [] };
  const fetchFn = deps.fetchFn ?? fetch;
  const now = deps.now ?? Date.now();
  try {
    const { data } = await db.from("google_connections").select("refresh_token_enc, status").maybeSingle();
    if (!data) return { status: "off", events: [] };
    if (data.status === "reconnect") return { status: "reconnect", events: [] };
    const cacheKey = `${userId}|${zone}|${from}|${to}`;
    const hit = eventsCache.get(cacheKey);
    if (hit && now - hit.at < EVENTS_TTL_MS) return { status: "ok", events: hit.events };
    const refreshToken = decryptToken(data.refresh_token_enc, config.key);
    if (!refreshToken) {
      await markReconnect(db, userId);
      return { status: "reconnect", events: [] };
    }
    const access = await accessTokenFor(config, userId, refreshToken, fetchFn, now);
    const calendars = await calendarsOf(access, fetchFn);
    // One calendar failing (for example a shared one that went away) does not hide the others.
    const results = await Promise.allSettled(calendars.map((c) => eventsOf(access, c, zone, from, to, fetchFn)));
    const failed = results.filter((r) => r.status === "rejected").length;
    if (calendars.length > 0 && failed === calendars.length) {
      const first = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
      throw first.reason;
    }
    const events = sortGoogleEvents(results.flatMap((r) => (r.status === "fulfilled" ? r.value : [])));
    eventsCache.set(cacheKey, { at: now, events });
    return { status: "ok", events };
  } catch (e) {
    if (e instanceof GoogleError && (e.code === "invalid_grant" || (e.status === 400 && /invalid_grant/i.test(e.message)))) {
      accessTokens.delete(userId);
      await markReconnect(db, userId);
      return { status: "reconnect", events: [] };
    }
    if (e instanceof GoogleError && e.status === 401) {
      accessTokens.delete(userId); // the saved access token went bad: the next try asks for a new one
    }
    return { status: "error", events: [] };
  }
}

async function markReconnect(db: Db, userId: string) {
  accessTokens.delete(userId);
  await db.from("google_connections").update({ status: "reconnect" }).eq("user_id", userId);
}

/** Tells Google to forget the link (best effort: the row here is removed either way). */
export async function revokeToken(refreshToken: string, fetchFn: Fetch = fetch) {
  try {
    await fetchFn(REVOKE_URL, { ...form({ token: refreshToken }), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch {
    // Nothing more to do: the person can also remove it at myaccount.google.com/permissions.
  }
}

/** The page the Google sign-in comes back to. */
export function redirectUri(headers: Headers, env: Record<string, string | undefined> = process.env) {
  if (env.GOOGLE_REDIRECT_URI?.trim()) return env.GOOGLE_REDIRECT_URI.trim();
  const host = headers.get("x-forwarded-host") || headers.get("host") || "localhost:3000";
  const proto = headers.get("x-forwarded-proto") || (/^(localhost|127\.)/.test(host) ? "http" : "https");
  return `${proto.split(",")[0].trim()}://${host.split(",")[0].trim()}/settings/google`;
}

