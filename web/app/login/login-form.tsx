"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthCard, FormMessage } from "@/components/auth/auth-card";
import { createClient } from "@/lib/supabase/client";

export function LoginForm({ next, initialError }: { next: string; initialError: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);
  const [notice, setNotice] = useState("");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email")).trim();
    const password = String(form.get("password"));
    setBusy(true);
    setError("");
    setNotice("");
    const supabase = createClient();

    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) return setError(error.message === "Invalid login credentials" ? "That email and password do not match." : error.message);
      router.replace(next);
      router.refresh();
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: String(form.get("name")).trim() }, emailRedirectTo: `${window.location.origin}/auth/confirm` },
    });
    setBusy(false);
    if (error) return setError(error.message);
    if (data.session) {
      router.replace("/");
      router.refresh();
    } else {
      setNotice("Account created. Check your email and click the link to confirm it, then sign in.");
      setMode("signin");
    }
  }

  const signup = mode === "signup";
  return (
    <AuthCard title={signup ? "Create your account" : "Welcome back"} subtitle={signup ? "Your private life dashboard." : "Sign in to your dashboard."}>
      <form onSubmit={submit} className="space-y-4">
        {error && <FormMessage tone="error">{error}</FormMessage>}
        {notice && <FormMessage tone="success">{notice}</FormMessage>}
        {signup && (
          <div>
            <label className="label" htmlFor="name">Your name</label>
            <input id="name" name="name" className="input" autoComplete="name" required />
          </div>
        )}
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" className="input" autoComplete="email" required />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label className="label" htmlFor="password">Password</label>
            {!signup && (
              <Link href="/forgot-password" className="mb-1.5 text-xs font-medium text-blue-600 hover:text-blue-700">
                Forgot password?
              </Link>
            )}
          </div>
          <input id="password" name="password" type="password" className="input" autoComplete={signup ? "new-password" : "current-password"} minLength={signup ? 8 : undefined} required />
          {signup && <p className="mt-1 text-xs text-slate-500">At least 8 characters.</p>}
        </div>
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {busy ? "Please wait…" : signup ? "Create account" : "Sign in"}
        </button>
      </form>
      <p className="mt-5 text-center text-sm text-slate-500">
        {signup ? "Already have an account?" : "New here?"}{" "}
        <button type="button" className="font-medium text-blue-600 hover:text-blue-700" onClick={() => setMode(signup ? "signin" : "signup")}>
          {signup ? "Sign in" : "Create an account"}
        </button>
      </p>
    </AuthCard>
  );
}
