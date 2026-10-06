import { cacheMutate as mutate, clearCache } from "./cache";
import { createClient } from "./supabase/client";

// All data goes through this app's own API (app/api), which checks the sign-in token on every request.
const API_URL = "/api";

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

type Options = { method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; body?: unknown };

async function send(path: string, options: Options, token: string | undefined) {
  return fetch(`${API_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });
}

/** Calls the API as the signed-in user. Throws ApiError with a readable message. */
export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  let res: Response;
  try {
    res = await send(path, options, data.session?.access_token);
    if (res.status === 401) {
      // The token may have just expired: refresh once and try again.
      const refreshed = await supabase.auth.refreshSession();
      if (!refreshed.data.session) {
        // Forget the dead session so /login does not send you straight back here.
        await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
        clearCache();
        // A full page load (not router.push) so no cached data from the old session survives.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
        throw new ApiError(401, "Please sign in again.");
      }
      res = await send(path, options, refreshed.data.session.access_token);
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(0, "Cannot reach the server. Check your internet connection.");
  }

  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, body?.error?.message ?? `Request failed (${res.status})`, body?.error?.details);
  return body as T;
}

/** SWR fetcher: the key is the API path. */
export const fetcher = <T,>(path: string) => api<T>(path);

/**
 * Reload cached API data whose path starts with any of the given prefixes (always includes the dashboard).
 * The reload runs in the background and this returns at once, so a form can close as soon as the
 * save itself succeeded (one trip to the server instead of two); the lists update a moment later.
 */
export function refresh(...prefixes: string[]) {
  const all = [...prefixes, "/dashboard", "/notifications"];
  mutate((key) => typeof key === "string" && all.some((p) => key === p || key.startsWith(`${p}?`) || key.startsWith(`${p}/`))).catch(() => undefined);
  return Promise.resolve();
}

/** Reload every cached API answer (after loading or deleting all data), in the background. */
export function refreshAll() {
  mutate(() => true).catch(() => undefined);
  return Promise.resolve();
}

/** A friendly message for any error. */
export function errorMessage(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

/** Downloads a file from the API (used for the data export). */
export async function download(path: string, fallbackName: string) {
  const { data } = await createClient().auth.getSession();
  const res = await send(path, {}, data.session?.access_token);
  if (!res.ok) throw new ApiError(res.status, "The download failed.");
  const name = res.headers.get("content-disposition")?.match(/filename="?([^"]+)"?/)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const link = Object.assign(document.createElement("a"), { href: url, download: name });
  link.click();
  URL.revokeObjectURL(url);
}
