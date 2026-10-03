import { Suspense } from "react";
import type { Metadata } from "next";
import { PageSkeleton } from "@/components/ui/states";
import { SettingsView } from "./settings-view";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  // The view reads ?tab= from the URL, which needs a Suspense boundary.
  return (
    <Suspense fallback={<PageSkeleton />}>
      <SettingsView />
    </Suspense>
  );
}
