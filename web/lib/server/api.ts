import type { NextRequest } from "next/server";
import { todayIn } from "./dates.ts";
import { HttpError, errorResponse, must } from "./http.ts";
import { clientFor, getAuthClient, type Db, type Row } from "./supabase.ts";

/** What every API endpoint gets. */
export type Ctx<P> = {
  req: NextRequest;
  params: P;
  user: { id: string; email: string };
  /** Database client acting as the signed-in user. */
  db: Db;
  /** The URL's ?query values. */
  query: Record<string, string>;
  /** The JSON body (undefined when empty). */
  body: () => Promise<unknown>;
  profile: () => Promise<Row<"profiles">>;
  /** Today's date in the user's time zone. */
  today: () => Promise<string>;
};

// Most requests need the user's time zone, so profiles are kept in memory briefly.
// Short, because Vercel may run several copies of the app and each has its own memory.
const PROFILE_TTL_MS = 30 * 1000;
const profiles = new Map<string, { profile: Row<"profiles">; at: number }>();

/** Call after changing a profile. */
export function forgetProfile(userId: string) {
  profiles.delete(userId);
}

/** The signed-in user's profile. Creates it (with default categories) if missing. */
async function loadProfile(userId: string, db: Db) {
  const hit = profiles.get(userId);
  if (hit && Date.now() - hit.at < PROFILE_TTL_MS) return hit.profile;
  const profile = must(await db.rpc("ensure_profile"));
  profiles.set(userId, { profile, at: Date.now() });
  return profile;
}

/**
 * Checks the "Authorization: Bearer <token>" header sent by the web app.
 * The token comes from Supabase Auth; getClaims() verifies it.
 */
async function signedInUser(req: NextRequest) {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) throw new HttpError(401, "Please sign in.");

  const { data, error } = await getAuthClient().auth.getClaims(token);
  const userId = data?.claims?.sub;
  if (error || !userId) throw new HttpError(401, "Your session has ended. Please sign in again.");
  return { user: { id: userId, email: typeof data.claims.email === "string" ? data.claims.email : "" }, db: clientFor(token) };
}

async function readBody(req: NextRequest) {
  const text = await req.text();
  if (text.length > 200_000) throw new HttpError(413, "The request is too large.");
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, "The request body is not valid JSON.");
  }
}

/**
 * Turns a function into an API endpoint: only signed-in users get in, the result
 * is sent as JSON (with `status`), and any error becomes { error: { message } }.
 */
export function handle<P extends Record<string, string> = Record<string, string>>(endpoint: (ctx: Ctx<P>) => Promise<unknown>, { status = 200 } = {}) {
  return async (req: NextRequest, context: { params: Promise<P> }) => {
    try {
      const { user, db } = await signedInUser(req);
      let body: Promise<unknown> | undefined;
      let profile: Promise<Row<"profiles">> | undefined;
      const ctx: Ctx<P> = {
        req,
        params: await context.params,
        user,
        db,
        query: Object.fromEntries(req.nextUrl.searchParams),
        body: () => (body ??= readBody(req)),
        profile: () => (profile ??= loadProfile(user.id, db)),
        today: async () => todayIn((await ctx.profile()).timezone),
      };
      const result = await endpoint(ctx);
      return result instanceof Response ? result : Response.json(result, { status });
    } catch (error) {
      return errorResponse(error);
    }
  };
}

/** The usual answer after deleting something. */
export const ok = { ok: true };
