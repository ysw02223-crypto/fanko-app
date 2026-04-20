"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { label: "주문 목록", href: "/orders" },
  { label: "배송 관리", href: "/shipping", disabled: true },
  { label: "변경 이력", href: "/history", disabled: true },
  { label: "재무관리", href: "/finance" },
];

export function NavMenu() {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-0.5">
      {TABS.map((tab) => {
        const isActive = pathname === tab.href || pathname.startsWith(tab.href + "/");

        if (tab.disabled) {
          return (
            <span
              key={tab.href}
              className="rounded-md px-2.5 py-1.5 text-xs font-medium text-zinc-300 select-none dark:text-zinc-600"
            >
              {tab.label}
            </span>
          );
        }

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
              isActive
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400"
                : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
