"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import useSWR from "swr";
import { Bell, ChevronDown, Leaf, LogOut, Menu, Search, Settings, User } from "lucide-react";
import { api, errorMessage } from "@/lib/api";
import { colorOf } from "@/lib/colors";
import { useProfile } from "@/lib/profile";
import { clearCache } from "@/lib/cache";
import { createClient } from "@/lib/supabase/client";
import type { AppNotification } from "@/lib/types";
import { useFeedback } from "../ui/feedback";
import { Icon } from "../ui/icon";
import { Dropdown } from "./dropdown";
import { activeItem } from "./nav";

/** Your profile photo, or a small drawing until you add one (also when the photo cannot be loaded). */
export function Avatar({ className, src }: { className: string; src?: string | null }) {
  const [broken, setBroken] = useState<string | null>(null);
  const photo = src && broken !== src ? src : null;
  // One failed load (a bad connection, say) must not hide the photo for good: try again when the phone is back
  // online or the app comes to the front, and at the latest after a minute.
  useEffect(() => {
    if (!broken) return;
    const retry = () => {
      if (document.visibilityState === "visible") setBroken(null);
    };
    window.addEventListener("online", retry);
    document.addEventListener("visibilitychange", retry);
    const timer = setTimeout(retry, 60_000);
    return () => {
      window.removeEventListener("online", retry);
      document.removeEventListener("visibilitychange", retry);
      clearTimeout(timer);
    };
  }, [broken]);
  return (
    <span className={`${className} block shrink-0 overflow-hidden rounded-full shadow-sm ring-2 ring-white`}>
      {photo ? (
        // A plain <img>: the picture is already a small square, so the Next.js image optimizer would only add a hop.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" className="block size-full object-cover" decoding="async" draggable={false} onError={() => setBroken(photo)} />
      ) : (
        <svg viewBox="0 0 40 40" className="block size-full" aria-hidden>
          <rect width="40" height="40" fill="#cfe3fb" />
          <circle cx="28" cy="13" r="5" fill="#fde68a" />
          <path d="M0 29 L11 18 L18 25 L26 16 L40 28 V40 H0Z" fill="#9fd9b0" />
          <path d="M0 33 C8 29 16 31 22 33 S34 30 40 32 V40 H0Z" fill="#5fbf7f" />
        </svg>
      )}
    </span>
  );
}

function Notifications() {
  const { data, mutate } = useSWR<{ items: AppNotification[]; unread: number }>("/notifications", { refreshInterval: 5 * 60 * 1000 });
  const { toast } = useFeedback();

  const markRead = async (close: () => void) => {
    try {
      await api("/notifications/read", { method: "POST" });
      await mutate();
      close();
    } catch (error) {
      toast(errorMessage(error), "error");
    }
  };

  return (
    <Dropdown
      label="Notifications"
      panelClassName="w-80 overflow-hidden max-sm:fixed max-sm:inset-x-4 max-sm:top-16 max-sm:w-auto"
      buttonClassName="btn btn-ghost btn-icon relative"
      button={
        <>
          <Bell className="size-5" />
          {Boolean(data?.unread) && <span className="absolute right-2.5 top-2.5 size-2 rounded-full bg-rose-500 ring-2 ring-white" />}
        </>
      }
    >
      {(close) => (
        <>
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">Notifications</p>
            {Boolean(data?.unread) && (
              <button type="button" className="text-xs font-medium text-blue-600 hover:text-blue-700" onClick={() => markRead(close)}>
                Mark all as read
              </button>
            )}
          </div>
          {data?.items.length ? (
            <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
              {data.items.map((n) => (
                <li key={n.id}>
                  <Link href={n.href} onClick={close} className="flex gap-3 px-4 py-3 hover:bg-slate-50">
                    <span className={`icon-tile size-8 ${colorOf(n.tone).tile}`}>
                      <Icon name={n.icon} className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-slate-800 [overflow-wrap:anywhere]">{n.title}</span>
                      <span className="block text-xs text-slate-500 [overflow-wrap:anywhere]">{n.meta}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-slate-500">{data ? "All quiet. Nothing needs you right now." : "Loading…"}</p>
          )}
        </>
      )}
    </Dropdown>
  );
}

/**
 * The profile button and its menu. On phones and tablets it is just the round photo at the left of the bar;
 * on a wide screen it also shows your name and sits at the right.
 */
function ProfileMenu({ compact = false }: { compact?: boolean }) {
  const { profile } = useProfile();
  const router = useRouter();
  const item = "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50";

  const signOut = async () => {
    await createClient().auth.signOut();
    clearCache();
    router.replace("/login");
    router.refresh();
  };

  return (
    <Dropdown
      label="Account menu"
      align={compact ? "left" : "right"}
      panelClassName="w-64 p-1.5"
      buttonClassName={compact ? "flex items-center rounded-full transition hover:opacity-85" : "flex items-center gap-3 rounded-xl p-1 transition hover:bg-slate-100 sm:pr-2"}
      button={
        <>
          <Avatar className="size-10" src={profile?.avatar_url} />
          {!compact && (
            <>
              <span className="hidden text-left leading-tight xl:block">
                <span className="block text-sm font-semibold text-slate-800">{profile?.full_name || "A Better You"}</span>
                <span className="block text-xs text-slate-500">{profile?.tagline || "Every Day"}</span>
              </span>
              <ChevronDown className="hidden size-4 text-slate-500 sm:block" />
            </>
          )}
        </>
      }
    >
      {(close) => (
        <>
          <div className="flex items-center gap-3 px-3 py-2.5">
            <Avatar className="size-9" src={profile?.avatar_url} />
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-semibold text-slate-900">{profile?.full_name || "Your profile"}</p>
              <p className="truncate text-xs text-slate-500">{profile?.email}</p>
            </div>
          </div>
          <div className="my-1 border-t border-slate-100" />
          <Link href="/settings" className={item} onClick={close}>
            <User className="size-4 text-slate-500" />
            My profile
          </Link>
          <Link href="/settings?tab=preferences" className={item} onClick={close}>
            <Settings className="size-4 text-slate-500" />
            Settings
          </Link>
          <button type="button" className={`${item} text-rose-600 hover:bg-rose-50`} onClick={signOut}>
            <LogOut className="size-4" />
            Sign out
          </button>
        </>
      )}
    </Dropdown>
  );
}

export function Topbar({ onMenu, onSearch }: { onMenu: () => void; onSearch: () => void }) {
  const pathname = usePathname();
  const label = activeItem(pathname)?.label ?? "POS";

  // Below the lg breakpoint the page menu opens from the right, so the profile photo takes the left;
  // from lg up the menu is the always-open sidebar and the profile stays at the right.
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/90 backdrop-blur">
      <div className="flex h-16 items-center gap-2 px-4 sm:h-18 sm:gap-3 sm:px-6 xl:px-8">
        <div className="shrink-0 lg:hidden">
          <ProfileMenu compact />
        </div>
        <Link href="/" className="flex min-w-0 items-center gap-3">
          <Leaf className="hidden size-8 shrink-0 fill-emerald-100 text-emerald-600 lg:block" />
          <span className="min-w-0">
            <span className="block truncate text-lg font-bold tracking-tight text-slate-900 sm:hidden">{label}</span>
            <span className="hidden truncate text-xl font-bold tracking-tight text-slate-900 sm:block">Life Management System</span>
            <span className="hidden truncate text-sm text-slate-500 md:block">A more intentional you, every day.</span>
          </span>
        </Link>
        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          <button
            type="button"
            onClick={onSearch}
            className="mr-1 hidden h-11 w-60 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-left text-sm text-slate-400 transition hover:border-slate-300 hover:bg-white lg:flex xl:w-80 2xl:w-96"
          >
            <Search className="size-4.5 shrink-0 text-slate-500" />
            <span className="flex-1 truncate">Search anything… (tasks, notes, goals, etc.)</span>
            <kbd className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-sans text-[11px] font-medium text-slate-500">Ctrl K</kbd>
          </button>
          <button type="button" onClick={onSearch} className="btn btn-ghost btn-icon lg:hidden" aria-label="Search">
            <Search className="size-5" />
          </button>
          <Notifications />
          <span className="mx-1 hidden h-8 w-px bg-slate-200 lg:block" />
          <div className="hidden lg:block">
            <ProfileMenu />
          </div>
          <button type="button" className="btn btn-ghost btn-icon -mr-2 lg:hidden" onClick={onMenu} aria-label="Open menu">
            <Menu className="size-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
