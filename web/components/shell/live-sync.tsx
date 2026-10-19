"use client";

import { useEffect } from "react";
import { refresh, refreshAll } from "@/lib/api";
import { createBatcher, LIVE_TABLES } from "@/lib/live-sync";
import { createClient } from "@/lib/supabase/client";

/**
 * Real-time sync: listens for changes in the database (made on this device or another one) and reloads the screens that show them,
 * a moment later, without a page reload. It shows nothing. The data itself always comes through the API; a change only says "reload".
 * If the live connection drops, everything is reloaded when it comes back, and every 30 seconds in between.
 */
export function LiveSync() {
  useEffect(() => {
    const supabase = createClient();
    let stopped = false;
    let connected = false;
    let wasConnected = false;
    // A field that keeps its own draft (the course notes) must not be reloaded under the cursor.
    const batcher = createBatcher((prefixes) => void refresh(...prefixes), { busy: () => Boolean(document.activeElement?.closest("[data-live-skip]")) });
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const start = async () => {
      const { data } = await supabase.auth.getSession();
      if (stopped || !data.session) return;
      supabase.realtime.setAuth(data.session.access_token);
      let next = supabase.channel("pos-live");
      for (const table of LIVE_TABLES) next = next.on("postgres_changes", { event: "*", schema: "public", table }, () => batcher.push(table));
      channel = next.subscribe((status) => {
        if (stopped) return;
        if (status === "SUBSCRIBED") {
          connected = true;
          // Back after a gap: anything may have changed meanwhile.
          if (wasConnected) void refreshAll();
          wasConnected = true;
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          connected = false;
        }
      });
    };
    void start();

    const poll = setInterval(() => {
      if (!connected && document.visibilityState === "visible") void refreshAll();
    }, 30_000);
    const online = () => {
      if (!connected) void refreshAll();
    };
    window.addEventListener("online", online);

    return () => {
      stopped = true;
      clearInterval(poll);
      window.removeEventListener("online", online);
      batcher.cancel();
      if (channel) void supabase.removeChannel(channel);
    };
  }, []);

  return null;
}
