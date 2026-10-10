import type { ReactNode } from "react";
import Link from "next/link";

/** The two parts of Learning: your courses (the study plan) and the library of certificate courses and playlists. */
export function LearningTabs({ current }: { current: "courses" | "library" }) {
  const tabs = [
    { id: "courses", href: "/learning", label: "My courses" },
    { id: "library", href: "/learning/library", label: "Certificates & playlists" },
  ] as const;
  return (
    <nav className="segmented" aria-label="Learning sections">
      {tabs.map((tab) => (
        <Link key={tab.id} href={tab.href} aria-current={tab.id === current ? "page" : undefined}>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * The row under the Learning title, the same on both parts: the two sections on the left, what to show (a filter) in the
 * middle and the buttons that add things on the right (spread evenly on a very wide screen, the buttons pushed to the right edge
 * on a laptop). On a narrow screen the three groups wrap onto their own lines.
 */
export function LearningToolbar({ current, filter, actions }: { current: "courses" | "library"; filter?: ReactNode; actions: ReactNode }) {
  return (
    <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3 2xl:justify-between">
      <LearningTabs current={current} />
      {filter}
      <div className="flex min-w-0 flex-wrap items-center gap-2 sm:ml-auto 2xl:ml-0">{actions}</div>
    </div>
  );
}
