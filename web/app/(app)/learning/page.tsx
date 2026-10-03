import type { Metadata } from "next";
import { LearningView } from "./learning-view";

export const metadata: Metadata = { title: "Learning" };

export default function LearningPage() {
  return <LearningView />;
}
