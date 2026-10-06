"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sprout, X } from "lucide-react";
import { prefetchPage } from "@/lib/prefetch";
import { NAV, SETTINGS_NAV, activeItem, type NavItem } from "./nav";

function Hills() {
  return (
    <svg viewBox="0 0 240 120" className="block w-full shrink-0 [@media(max-height:700px)]:hidden" aria-hidden>
      <path d="M0 58 C28 44 52 42 80 52 S138 36 172 46 S222 40 240 44 V120 H0Z" fill="#dde9e1" />
      <path d="M0 76 C36 62 70 66 104 74 S172 58 240 70 V120 H0Z" fill="#c3dccb" />
      <path d="M0 94 C46 82 88 88 126 94 S198 82 240 88 V120 H0Z" fill="#a6cbb1" />
      <g fill="#6f9f7e">
        <path d="M22 62 l-9 18 h5 l-8 16 h24 l-8 -16 h5 z" />
        <path d="M42 70 l-7 14 h4 l-6 12 h18 l-6 -12 h4 z" />
        <path d="M8 74 l-6 12 h3 l-5 10 h16 l-5 -10 h3 z" />
        <path d="M200 72 l-7 14 h4 l-6 12 h18 l-6 -12 h4 z" />
        <path d="M220 64 l-9 18 h5 l-8 16 h24 l-8 -16 h5 z" />
      </g>
      <path d="M0 104 C60 96 120 102 170 104 S220 98 240 100 V120 H0Z" fill="#8fbc9b" />
    </svg>
  );
}

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const current = activeItem(pathname);

  const link = (item: NavItem) => (
    <li key={item.href}>
      <Link
        href={item.href}
        className="nav-link"
        aria-current={current === item ? "page" : undefined}
        onClick={onClose}
        onMouseEnter={() => prefetchPage(item.href)}
        onFocus={() => prefetchPage(item.href)}
        onTouchStart={() => prefetchPage(item.href)}
      >
        <item.icon className="size-5 shrink-0" />
        <span>{item.label}</span>
      </Link>
    </li>
  );

  return (
    <>
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col overflow-hidden border-r border-slate-200/70 bg-[#f2f5f9] transition-transform duration-300 lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
        aria-label="Main menu"
      >
        <div className="flex h-18 shrink-0 items-center gap-3 px-5">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-600">
            <Sprout className="size-6" />
          </span>
          <Link href="/" className="min-w-0 leading-tight" onClick={onClose}>
            <span className="block text-[15px] font-bold text-slate-900">POS</span>
            <span className="block text-xs text-slate-500">Live well. Plan better.</span>
          </Link>
          <button type="button" className="btn btn-ghost btn-sm btn-icon ml-auto lg:hidden" onClick={onClose} aria-label="Close menu">
            <X className="size-5" />
          </button>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-2">
          <ul className="space-y-1">{NAV.map(link)}</ul>
          <div className="mx-3 my-3 border-t border-slate-200/80" />
          <ul>{link(SETTINGS_NAV)}</ul>
        </nav>
        <div className="shrink-0 px-4 [@media(max-height:820px)]:hidden">
          <figure className="rounded-2xl bg-white/70 px-4 py-4 text-center ring-1 ring-slate-200/60">
            <Sprout className="mx-auto size-5 text-emerald-500" />
            <blockquote className="mt-2 text-[13px] leading-relaxed text-slate-600">“A better life is a series of small, intentional choices.”</blockquote>
          </figure>
        </div>
        <Hills />
      </aside>
      {open && <div className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden" onClick={onClose} aria-hidden />}
    </>
  );
}
