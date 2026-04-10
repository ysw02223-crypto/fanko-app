"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef } from "react";

type SubItem = { label: string; href: string };

type TopMenu = {
  label: string;
  items: SubItem[];
  disabled?: boolean;
};

const TOP_MENUS: TopMenu[] = [
  {
    label: "러시아 주문",
    items: [
      { label: "주문 목록", href: "/orders" },
      { label: "주문 추가", href: "/orders/new" },
      { label: "배송 관리", href: "/shipping" },
      { label: "변경 이력", href: "/history" },
    ],
  },
  {
    label: "재무관리",
    items: [
      { label: "재무 대시보드", href: "/finance" },
      { label: "수입 목록", href: "/finance/income" },
      { label: "지출 목록", href: "/finance/expense" },
      { label: "환전 관리", href: "/finance/exchange" },
    ],
  },
];

export function NavMenu() {
  const pathname = usePathname();
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const navRef = useRef<HTMLDivElement>(null);

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
              key={menu.label}
              title="준비 중"
              className="cursor-not-allowed rounded-md px-3 py-1.5 text-sm font-medium text-zinc-300 select-none dark:text-zinc-600"
            >
              {menu.label}
            </span>
          );
        }

        return (
          <div key={menu.label} className="relative">
            <button
              onClick={() => setOpenIdx(isOpen ? null : idx)}
              className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                isActive
                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                  : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              }`}
            >
              {menu.label}
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
                      {item.label}
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
