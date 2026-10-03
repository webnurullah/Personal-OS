"use client";

import { createContext, useContext, type ReactNode } from "react";
import useSWR from "swr";
import { formatMoney, formatTime } from "./format";
import type { Profile } from "./types";

type ProfileValue = {
  profile: Profile | undefined;
  /** Money in your currency, hidden if you chose "Hide money amounts". */
  money: (amount: number) => string;
  /** "13:30" in your time format. */
  time: (hhmm: string) => string;
};

const ProfileContext = createContext<ProfileValue | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { data: profile } = useSWR<Profile>("/profile");
  const value: ProfileValue = {
    profile,
    money: (amount) => formatMoney(amount, profile?.currency ?? "BDT", profile?.hide_amounts ?? false),
    time: (hhmm) => formatTime(hhmm, profile?.time_format ?? "12h"),
  };
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const value = useContext(ProfileContext);
  if (!value) throw new Error("useProfile must be used inside <ProfileProvider>");
  return value;
}
