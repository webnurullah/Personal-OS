import type { Metadata } from "next";
import { JobsView } from "./jobs-view";

export const metadata: Metadata = { title: "Job Apply" };

export default function JobsPage() {
  return <JobsView />;
}
