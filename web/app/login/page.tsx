import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[]; error?: string | string[] }> }) {
  const params = await searchParams;
  const first = (value?: string | string[]) => (Array.isArray(value) ? value[0] : value) ?? "";
  // ?next=/tasks: where to go after signing in (only paths on this site). ?error=…: from an email link.
  const target = first(params.next);
  const next = target.startsWith("/") && !target.startsWith("//") ? target : "/";
  return <LoginForm next={next} initialError={first(params.error)} />;
}
