import { Archive, BriefcaseBusiness, CalendarDays, ChartColumn, FileText, FolderKanban, GraduationCap, Heart, House, Settings, SquareCheck, Target, Wallet, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

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
  { href: "/jobs", label: "Job Apply", icon: BriefcaseBusiness },
];

// Below the main list, after a line: Settings, then the Archive (where everything you delete waits until you delete it for good).
export const SETTINGS_NAV: NavItem = { href: "/settings", label: "Settings", icon: Settings };
export const ARCHIVE_NAV: NavItem = { href: "/archive", label: "Archive", icon: Archive };

/** Which menu item a URL belongs to ("/learning/abc" → Learning). */
export function activeItem(pathname: string) {
  return [...NAV, SETTINGS_NAV, ARCHIVE_NAV].find((item) => (item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`)));
}
