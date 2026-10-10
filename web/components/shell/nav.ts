import { Archive, Building2, BriefcaseBusiness, CalendarDays, ChartColumn, FileText, FolderKanban, GraduationCap, Heart, House, Settings, SquareCheck, Target, Wallet, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; /** Pages that belong under it (shown a step in, under the item). */ children?: NavItem[] };

export const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: House },
  { href: "/tasks", label: "Tasks", icon: SquareCheck },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/learning", label: "Learning", icon: GraduationCap },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/habits", label: "Habits", icon: ChartColumn },
  { href: "/finance", label: "Finance", icon: Wallet },
  { href: "/health", label: "Health", icon: Heart },
  { href: "/notes", label: "Notes", icon: FileText },
  { href: "/jobs", label: "Job Apply", icon: BriefcaseBusiness, children: [{ href: "/jobs/companies", label: "Company list", icon: Building2 }] },
];

// Below the main list, after a line: Settings, then the Archive (where everything you delete waits until you delete it for good).
export const SETTINGS_NAV: NavItem = { href: "/settings", label: "Settings", icon: Settings };
export const ARCHIVE_NAV: NavItem = { href: "/archive", label: "Archive", icon: Archive };

/** Every page in the menu, sub-menu pages included. */
export const ALL_NAV: NavItem[] = [...NAV.flatMap((item) => [item, ...(item.children ?? [])]), SETTINGS_NAV, ARCHIVE_NAV];

/** Which menu item a URL belongs to ("/learning/abc" → Learning, "/jobs/companies" → Company list: the most specific one wins). */
export function activeItem(pathname: string) {
  return ALL_NAV.filter((item) => (item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`))).sort((a, b) => b.href.length - a.href.length)[0];
}
