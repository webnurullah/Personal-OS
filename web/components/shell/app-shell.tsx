"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { SWRConfig, useSWRConfig } from "swr";
import { fetcher } from "@/lib/api";
import { bindMutate, clearCache, persistentCache } from "@/lib/cache";
import { prefetchAll } from "@/lib/prefetch";
import { ProfileProvider } from "@/lib/profile";
import { createClient } from "@/lib/supabase/client";
import { PageSkeleton } from "../ui/states";
import { FeedbackProvider } from "../ui/feedback";
import { Assistant } from "./assistant";
import { CommandPalette } from "./command-palette";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

const noop = () => () => {};

/** Sends you to /login when this browser has no session (checked here, without a trip to the server). */
function useSignedIn() {
  useEffect(() => {
    const supabase = createClient();
    const toLogin = () => {
      clearCache();
      const here = window.location.pathname + window.location.search;
      window.location.replace(here === "/" ? "/login" : `/login?next=${encodeURIComponent(here)}`);
    };
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) toLogin();
    });
    // Signed out in another tab.
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") toLogin();
    });
    return () => data.subscription.unsubscribe();
  }, []);
}

/** Lets refresh() and the prefetching reach the app's cache. */
function BindMutate() {
  const { mutate } = useSWRConfig();
  bindMutate(mutate);
  return null;
}

/** The frame around every signed-in page: sidebar, top bar, search, toasts. */
export function AppShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  // The data saved in this browser exists only after the page has loaded, so the first
  // render (the same as the prerendered HTML) shows the frame with a skeleton.
  const loaded = useSyncExternalStore(noop, () => true, () => false);
  useSignedIn();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Once the first page is up, load the other pages' data quietly so they open at once.
  useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(prefetchAll, 1500);
    return () => clearTimeout(timer);
  }, [loaded]);

  if (!loaded) {
    return (
      <>
        <Sidebar open={false} onClose={() => {}} />
        <div className="lg:pl-60">
          <header className="sticky top-0 z-20 h-16 border-b border-slate-200/70 bg-white/90 sm:h-18" />
          <main className="mx-auto w-full max-w-[1720px] px-4 py-6 sm:px-6 xl:px-8">
            <PageSkeleton />
          </main>
        </div>
      </>
    );
  }

  return (
    <SWRConfig value={{ fetcher, provider: persistentCache, revalidateOnFocus: true, shouldRetryOnError: false, keepPreviousData: true }}>
      <BindMutate />
      <FeedbackProvider>
        <ProfileProvider>
          <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
          <div className="lg:pl-60">
            <Topbar onMenu={() => setMenuOpen(true)} onSearch={() => setSearchOpen(true)} />
            <main className="mx-auto w-full max-w-[1720px] px-4 py-6 sm:px-6 xl:px-8">{children}</main>
          </div>
          <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
          <Assistant />
        </ProfileProvider>
      </FeedbackProvider>
    </SWRConfig>
  );
}
