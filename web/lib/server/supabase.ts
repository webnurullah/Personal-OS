import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types.ts";
import { HttpError } from "./http.ts";

export type Db = SupabaseClient<Database>;
export type Row<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];

const noSession = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };

// The same two public values the browser uses (never the secret key).
function settings() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new HttpError(500, "The server is missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  return { url, key };
}

let authClient: Db | undefined;

/** Only used to check sign-in tokens. It keeps Supabase's public signing keys in memory. */
export function getAuthClient() {
  const { url, key } = settings();
  authClient ??= createClient<Database>(url, key, { auth: noSession });
  return authClient;
}

/**
 * A client that acts as the signed-in user: Supabase applies Row Level
 * Security to every query, so one user can never touch another's rows.
 */
export function clientFor(token: string): Db {
  const { url, key } = settings();
  return createClient<Database>(url, key, {
    auth: noSession,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}
