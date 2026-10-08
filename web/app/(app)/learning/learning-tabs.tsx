import Link from "next/link";

/** The two parts of Learning: your courses (the study plan) and the library of certificate courses and playlists. */
export function LearningTabs({ current }: { current: "courses" | "library" }) {
  const tabs = [
    { id: "courses", href: "/learning", label: "My courses" },
    { id: "library", href: "/learning/library", label: "Certificates & playlists" },
  ] as const;
  return (
    <nav className="segmented mt-5" aria-label="Learning sections">
      {tabs.map((tab) => (
        <Link key={tab.id} href={tab.href} aria-current={tab.id === current ? "page" : undefined}>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
