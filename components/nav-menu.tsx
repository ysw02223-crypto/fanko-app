"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { useT } from "@/lib/i18n";

type SubItem = { labelKey: string; href: string };
type TopMenu = { labelKey: string; items: SubItem[]; disabled?: boolean };

export function NavMenu() {
  const pathname = usePathname();
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const t = useT();

  const TOP_MENUS: TopMenu[] = [
    {
      labelKey: "nav_russia_orders",
      items: [
        { labelKey: "nav_order_list", href: "/orders" },
        { labelKey: "nav_order_new", href: "/orders/new" },
        { labelKey: "nav_shipping", href: "/shipping" },
        { labelKey: "nav_history", href: "/history" },
      ],
    },
    {
      labelKey: "nav_finance",
      items: [
        { labelKey: "nav_finance_dashboard", href: "/finance" },
        { labelKey: "nav_income_list", href: "/finance/income" },
        { labelKey: "nav_expense_list", href: "/finance/expense" },
        { labelKey: "nav_exchange", href: "/finance/exchange" },
      ],
    },
  ];

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenIdx(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    setOpenIdx(null);
  }, [pathname]);

  return (
    <div ref={navRef} className="flex items-center gap-1">
      {TOP_MENUS.map((menu, idx) => {
        const isActive = menu.items.some(
          (item) => pathname === item.href || pathname.startsWith(item.href + "/")
        );
        const isOpen = openIdx === idx;

        if (menu.disabled) {
          return (
            <span
              key={menu.labelKey}
              title={t.nav_coming_soon}
              className="cursor-not-allowed rounded-md px-3 py-1.5 text-sm font-medium text-zinc-300 select-none dark:text-zinc-600"
            >
              {t[menu.labelKey as keyof typeof t]}
            </span>
          );
        }

        return (
          <div key={menu.labelKey} className="relative">
            <button
              onClick={() => setOpenIdx(isOpen ? null : idx)}
              className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                isActive
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                  : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              }`}
            >
              {t[menu.labelKey as keyof typeof t]}
              <svg
                className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`}
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>

            {isOpen && (
              <div className="absolute left-0 top-full mt-1 z-50 min-w-[140px] rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                {menu.items.map((item) => {
                  const isItemActive =
                    pathname === item.href ||
                    (item.href !== "/orders" && pathname.startsWith(item.href + "/"));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`block px-4 py-2 text-sm transition ${
                        isItemActive
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                          : "text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                      }`}
                    >
                      {t[item.labelKey as keyof typeof t]}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
