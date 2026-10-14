import { Suspense } from "react";
import type { Metadata } from "next";
import { PageSkeleton } from "@/components/ui/states";
import { GoogleCallback } from "./google-callback";

export const metadata: Metadata = { title: "Connect Google Calendar" };

// Google sends the person back here (…/settings/google?code=…&state=…) after "Allow".
export default function GoogleCallbackPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <GoogleCallback />
    </Suspense>
  );
}
