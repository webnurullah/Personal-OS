import type { Metadata } from "next";
import { HealthView } from "./health-view";

export const metadata: Metadata = { title: "Health" };

export default function HealthPage() {
  return <HealthView />;
}
