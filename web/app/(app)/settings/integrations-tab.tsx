"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { CalendarDays, CircleAlert, CircleCheck, Link2, Unlink } from "lucide-react";
import { api, errorMessage, refresh } from "@/lib/api";
import { formatDate } from "@/lib/dates";
import { useFeedback } from "@/components/ui/feedback";

type GoogleState = { configured: boolean; connected: boolean; email: string; status: "off" | "ok" | "reconnect"; connected_at: string | null };

/** Settings → Integrations: link Google Calendar so its events also show in the Calendar page (read-only). */
export function IntegrationsTab() {
  const { toast, confirm } = useFeedback();
  const { data, error, mutate } = useSWR<GoogleState>("/google/status");
  const [busy, setBusy] = useState(false);
  // Back from Google's page (the browser may bring this page back as it was): the button works again.
  useEffect(() => {
    const back = (e: PageTransitionEvent) => {
      if (e.persisted) setBusy(false);
    };
    window.addEventListener("pageshow", back);
    return () => window.removeEventListener("pageshow", back);
  }, []);

  const connect = async () => {
    setBusy(true);
    try {
      const { url } = await api<{ url: string }>("/google/connect", { method: "POST" });
      window.location.assign(url); // Google's "allow access" page; it sends you back to /settings/google
    } catch (e) {
      toast(errorMessage(e), "error");
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!(await confirm({ title: "Disconnect Google Calendar?", message: "Google events will stop showing in your Calendar. Nothing is deleted in Google. You can connect again any time.", action: "Disconnect" }))) return;
    setBusy(true);
    try {
      await api("/google/disconnect", { method: "POST" });
      toast("Google Calendar disconnected");
      await mutate();
      void refresh("/events");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const needsReconnect = data?.connected && data.status === "reconnect";
  return (
    <section className="card p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <span className="icon-tile size-10 shrink-0 bg-blue-50 text-blue-600">
          <CalendarDays className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-slate-900">Google Calendar</h2>
          <p className="mt-0.5 text-sm text-slate-500">Show the events of all your Google calendars in the Calendar page. The app can only read them (you change events in Google), and Google events open in Google Calendar when you tap them.</p>
        </div>
      </div>

      {error && !data ? (
        <p className="mt-5 text-sm text-rose-600">{errorMessage(error)}</p>
      ) : !data ? (
        <p className="mt-5 text-sm text-slate-500">Loading…</p>
      ) : !data.configured ? (
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="status">
          <p className="flex items-center gap-2 font-semibold">
            <CircleAlert className="size-4 shrink-0" aria-hidden />
            Not set up on the server yet
          </p>
          <p className="mt-1">Add <code className="break-all">GOOGLE_CLIENT_ID</code>, <code className="break-all">GOOGLE_CLIENT_SECRET</code> and <code className="break-all">GOOGLE_TOKEN_KEY</code> in Vercel (Settings → Environment Variables) and redeploy. The step-by-step guide is in <code>docs/google-calendar-setup.md</code>.</p>
        </div>
      ) : data.connected ? (
        <div className="mt-5 space-y-4">
          {needsReconnect ? (
            <p className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="alert">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>Google no longer accepts the link{data.email ? ` for ${data.email}` : ""}. Connect again to bring your Google events back.</span>
            </p>
          ) : (
            <p className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800" role="status">
              <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span className="min-w-0 break-words">Connected{data.email ? ` as ${data.email}` : ""}{data.connected_at ? ` on ${formatDate(data.connected_at.slice(0, 10), "short")}` : ""}. Open the Calendar page to see your Google events.</span>
            </p>
          )}
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            {needsReconnect && (
              <button type="button" className="btn btn-primary" onClick={connect} disabled={busy}>
                <Link2 className="size-4" />
                Connect again
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={disconnect} disabled={busy}>
              <Unlink className="size-4" />
              Disconnect
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
          <button type="button" className="btn btn-primary" onClick={connect} disabled={busy}>
            <Link2 className="size-4" />
            {busy ? "Opening Google…" : "Connect Google Calendar"}
          </button>
          <p className="min-w-0 text-xs text-slate-500">Google asks you to allow “See your calendars”. You can remove the link here or at myaccount.google.com/permissions.</p>
        </div>
      )}
    </section>
  );
}
