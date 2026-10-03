"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AuthCard, FormMessage } from "@/components/auth/auth-card";
import { createClient } from "@/lib/supabase/client";

// Reached from the reset-password email (you are signed in by the link).
export default function UpdatePasswordPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password"));
    if (password !== String(form.get("confirm"))) return setError("The two passwords are not the same.");
    setBusy(true);
    setError("");
    const { error } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(error.message);
    router.replace("/");
    router.refresh();
  }

  return (
    <AuthCard title="Choose a new password" subtitle="Use at least 8 characters.">
      <form onSubmit={submit} className="space-y-4">
        {error && <FormMessage tone="error">{error}</FormMessage>}
        <div>
          <label className="label" htmlFor="password">New password</label>
          <input id="password" name="password" type="password" className="input" autoComplete="new-password" minLength={8} required />
        </div>
        <div>
          <label className="label" htmlFor="confirm">Type it again</label>
          <input id="confirm" name="confirm" type="password" className="input" autoComplete="new-password" minLength={8} required />
        </div>
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {busy ? "Saving…" : "Save password"}
        </button>
      </form>
    </AuthCard>
  );
}
