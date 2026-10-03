"use client";

import { useEffect, useState, type ReactNode } from "react";
import { SWRConfig } from "swr";
import { fetcher } from "@/lib/api";
import { ProfileProvider } from "@/lib/profile";
import { FeedbackProvider } from "../ui/feedback";
import { CommandPalette } from "./command-palette";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

/** The frame around every signed-in page: sidebar, top bar, search, toasts. */
export function AppShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

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

  return (
    <SWRConfig value={{ fetcher, revalidateOnFocus: true, shouldRetryOnError: false, keepPreviousData: true }}>
      <FeedbackProvider>
        <ProfileProvider>
          <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
          <div className="lg:pl-60">
            <Topbar onMenu={() => setMenuOpen(true)} onSearch={() => setSearchOpen(true)} />
            <main className="mx-auto w-full max-w-[1720px] px-4 py-6 sm:px-6 xl:px-8">{children}</main>
          </div>
          <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
        </ProfileProvider>
      </FeedbackProvider>
    </SWRConfig>
  );
}
