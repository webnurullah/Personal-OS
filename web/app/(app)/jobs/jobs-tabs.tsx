import Link from "next/link";

/** The two parts of Job Apply: the applications and the list of companies. */
export function JobsTabs({ current }: { current: "applications" | "companies" }) {
  const tabs = [
    { id: "applications", href: "/jobs", label: "Applications" },
    { id: "companies", href: "/jobs/companies", label: "Company list" },
  ] as const;
  return (
    <nav className="segmented mt-5" aria-label="Job Apply sections">
      {tabs.map((tab) => (
        <Link key={tab.id} href={tab.href} aria-current={tab.id === current ? "page" : undefined}>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
