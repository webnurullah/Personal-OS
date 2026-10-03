import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Links in Supabase emails (confirm sign-up, reset password) land here.
 * Works with both link styles: ?token_hash=…&type=… and ?code=….
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const code = params.get("code");
  const next = safeNext(params.get("next") ?? (type === "recovery" ? "/update-password" : "/"));
  const supabase = await createClient();

  let error: { message: string } | null = null;
  if (tokenHash && type) {
    ({ error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash }));
  } else if (code) {
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
  } else {
    error = { message: "This link is missing its code." };
  }

  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  redirect(next);
}

/** Only allow paths inside this app (no redirects to other websites). */
function safeNext(path: string) {
  return path.startsWith("/") && !path.startsWith("//") ? path : "/";
}
