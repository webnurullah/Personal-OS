"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { AuthCard, FormMessage } from "@/components/auth/auth-card";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email")).trim();
    setBusy(true);
    setError("");
    const { error } = await createClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/confirm?next=/update-password`,
    });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  return (
    <AuthCard title="Reset your password" subtitle="We will email you a link to choose a new one.">
      {sent ? (
        <FormMessage tone="success">If that email has an account, a reset link is on its way. Open it on this device.</FormMessage>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {error && <FormMessage tone="error">{error}</FormMessage>}
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" name="email" type="email" className="input" autoComplete="email" required />
          </div>
          <button type="submit" className="btn btn-primary w-full" disabled={busy}>
            {busy ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}
      <p className="mt-5 text-center text-sm">
        <Link href="/login" className="font-medium text-blue-600 hover:text-blue-700">Back to sign in</Link>
      </p>
    </AuthCard>
  );
}
