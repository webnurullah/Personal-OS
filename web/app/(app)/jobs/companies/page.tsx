import type { Metadata } from "next";
import { CompaniesView } from "./companies-view";

export const metadata: Metadata = { title: "Company list" };

export default function CompaniesPage() {
  return <CompaniesView />;
}
