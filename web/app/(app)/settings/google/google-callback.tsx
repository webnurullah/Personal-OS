"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CircleAlert, Loader2 } from "lucide-react";
import { api, errorMessage, refresh } from "@/lib/api";
import { useFeedback } from "@/components/ui/feedback";

/** The page Google sends the person back to: it finishes the connection, then returns to Settings. */
export function GoogleCallback() {
  const params = useSearchParams();
  const router = useRouter();
  const { toast } = useFeedback();
  const started = useRef(false);
  const [problem, setProblem] = useState("");

  const code = params.get("code");
  const state = params.get("state");
  const denied = params.get("error");
  // Nothing to finish when Google sent no code (access refused, or the page was opened by hand).
  const early = denied || !code || !state ? (denied === "access_denied" ? "Google Calendar was not allowed, so nothing was connected." : "This page is meant to be opened by Google after you press Connect.") : "";

  useEffect(() => {
    if (early || !code || !state || started.current) return; // a code can be used only once
    started.current = true;
    api<{ email: string }>("/google/link", { method: "POST", body: { code, state } })
      .then((done) => {
        toast(done.email ? `Google Calendar connected (${done.email})` : "Google Calendar connected");
        void refresh("/google", "/events");
        router.replace("/settings?tab=integrations");
      })
      .catch((e) => setProblem(errorMessage(e)));
  }, [early, code, state, router, toast]);

  return (
    <div className="card mx-auto mt-10 max-w-lg p-6 text-center">
      {problem || early ? (
        <>
          <span className="icon-tile mx-auto size-12 bg-rose-50 text-rose-500">
            <CircleAlert className="size-6" />
          </span>
          <p className="mt-3 font-semibold text-slate-900">Google Calendar was not connected</p>
          <p className="mt-1 text-sm text-slate-500">{problem || early}</p>
          <Link href="/settings?tab=integrations" className="btn btn-primary mt-5">Back to Settings</Link>
        </>
      ) : (
        <p className="flex items-center justify-center gap-2 text-sm font-medium text-slate-600" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Connecting Google Calendar…
        </p>
      )}
    </div>
  );
}
