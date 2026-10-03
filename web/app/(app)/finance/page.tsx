import type { Metadata } from "next";
import { FinanceView } from "./finance-view";

export const metadata: Metadata = { title: "Finance" };

export default function FinancePage() {
  return <FinanceView />;
}
