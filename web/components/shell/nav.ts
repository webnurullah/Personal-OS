import { BriefcaseBusiness, CalendarDays, ChartColumn, FileText, GraduationCap, Heart, House, Settings, SquareCheck, Target, Wallet, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

export const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: House },
  { href: "/tasks", label: "Tasks", icon: SquareCheck },
  { href: "/learning", label: "Learning", icon: GraduationCap },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/goals", label: "Goals", icon: Target },
  { href: "/habits", label: "Habits", icon: ChartColumn },
  { href: "/finance", label: "Finance", icon: Wallet },
  { href: "/health", label: "Health", icon: Heart },
  { href: "/notes", label: "Notes", icon: FileText },
];

// Applications → Job Apply (more kinds of applications can go here later).
export const APPLICATIONS_NAV: NavItem[] = [{ href: "/jobs", label: "Job Apply", icon: BriefcaseBusiness }];

export const SETTINGS_NAV: NavItem = { href: "/settings", label: "Settings", icon: Settings };

/** Which menu item a URL belongs to ("/learning/abc" → Learning). */
export function activeItem(pathname: string) {
  return [...NAV, ...APPLICATIONS_NAV, SETTINGS_NAV].find((item) => (item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`)));
}
