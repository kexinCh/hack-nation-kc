"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { housingProgram } from "@/lib/housing/program";
import { useTranslations } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", key: "home" },
  { href: "/setup", key: "setup" },
  { href: "/dashboard", key: "dashboard" },
  { href: "/documents", key: "documents" },
  { href: "/understand", key: "understand" },
  { href: "/prepare", key: "prepare" },
  { href: "/privacy", key: "privacy" },
] as const;

export function AppShell({
  children,
  announcement,
}: {
  children: ReactNode;
  announcement?: string;
}) {
  const pathname = usePathname();
  const { t } = useTranslations();

  return (
    <div className="case-shell min-h-screen text-[#1f2933]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-[#183b56] focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>
      <header className="case-header">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#6b5b3f]">
              {t.browserLocalDemo}
            </p>
            <p className="text-xl font-semibold leading-tight text-[#172026]">{t.productName}</p>
            <p className="text-sm leading-6 text-[#52616b]">{housingProgram.metroName}</p>
          </div>
          <nav aria-label="Main navigation" className="flex flex-wrap gap-2">
            {navItems.map((item) => {
              const active =
                item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "min-h-10 rounded-md px-3 py-2 text-sm font-semibold text-[#334e68] outline-none transition focus-visible:ring-3 focus-visible:ring-[#2f80ed]/40",
                    active
                      ? "bg-[#183b56] text-white shadow-sm"
                      : "hover:bg-[#e9e2d0] hover:text-[#172026]",
                  )}
                >
                  {t[item.key]}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main id="main-content" className="mx-auto min-h-[70vh] w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-8">
        {children}
      </main>
      <footer className="border-t border-[#d8d0bf] bg-[#fffdf7]/90">
        <div className="mx-auto max-w-6xl px-4 py-5 text-sm text-[#52616b] sm:px-6">
          {t.footer}
        </div>
      </footer>
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </div>
  );
}
