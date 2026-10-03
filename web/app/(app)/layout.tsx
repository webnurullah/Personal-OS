import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/app-shell";

// Every page inside app/(app) gets the sidebar and top bar.
export default function AppLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
