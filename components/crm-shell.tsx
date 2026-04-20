"use client";

import { signOut } from "@/lib/actions/auth";
import Link from "next/link";
import { NavMenu } from "@/components/nav-menu";

export function CrmShell({ email, children }: { email: string; children: React.ReactNode }) {

  return (
    <div className="flex min-h-full flex-col bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex h-[52px] w-full items-center gap-3 px-4">
          {/* Logo */}
          <Link href="/orders" className="flex shrink-0 items-center gap-2">
            <div
              className="flex h-[26px] w-[26px] items-center justify-center rounded-[7px] text-xs font-bold text-white"
              style={{ background: "linear-gradient(135deg, #059669, #047857)", letterSpacing: "-0.02em" }}
            >
              F
            </div>
            <span className="text-sm font-bold tracking-tight">
              FANKO <span className="font-medium text-zinc-400">CRM</span>
            </span>
          </Link>

          {/* Nav tabs */}
          <div className="ml-3">
            <NavMenu />
          </div>

          {/* Right side */}
          <div className="ml-auto flex items-center gap-2">
            {/* Search bar */}
            <div className="hidden items-center gap-1.5 rounded-md bg-zinc-100 px-2.5 py-1.5 text-xs text-zinc-500 sm:flex dark:bg-zinc-800 dark:text-zinc-400">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <span>검색…</span>
              <kbd className="ml-1 rounded border border-zinc-200 bg-white px-1 font-mono text-[10px] text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900">⌘K</kbd>
            </div>

            {/* New order button */}
            <Link
              href="/orders/new"
              className="flex items-center gap-1 rounded-[7px] bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              <span className="text-sm leading-none">+</span>
              <span className="hidden sm:inline">새 주문</span>
            </Link>

            {/* User avatar with logout */}
            <form action={signOut}>
              <button
                type="submit"
                title={`${email} — 로그아웃`}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-400 dark:hover:bg-emerald-900/60"
              >
                {email[0]?.toUpperCase() ?? "?"}
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Sticky subheader slot (filter bar portal target) */}
      <div id="crm-subheader-portal" className="sticky top-[52px] z-40" />

      <main className="w-full flex-1">{children}</main>
    </div>
  );
}
