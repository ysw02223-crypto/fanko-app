"use client";

import { signOut } from "@/lib/actions/auth";
import Link from "next/link";
import { useState } from "react";
import { SidebarNav } from "@/components/nav-menu";
import { useLanguage } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";

const LOCALES: { value: Locale; label: string }[] = [
  { value: "ko", label: "한국어" },
  { value: "en", label: "English" },
  { value: "ru", label: "Русский" },
];

export function CrmShell({
  email,
  children,
}: {
  email: string;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const { locale, setLocale } = useLanguage();

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950">

      {/* ── 사이드바 (push 방식: flex 흐름 안에 위치) ─────────────────────── */}
      <aside
        className={[
          "flex shrink-0 flex-col bg-slate-900 border-r border-slate-800",
          "transition-[width] duration-200 ease-in-out overflow-hidden",
          expanded ? "w-60" : "w-12",
        ].join(" ")}
      >
        {/* 상단: 햄버거 + (expanded일 때) 로고 */}
        <div
          className={[
            "flex h-[52px] shrink-0 items-center border-b border-slate-800",
            expanded ? "justify-between px-4" : "justify-center",
          ].join(" ")}
        >
          {expanded && (
            <Link
              href="/orders"
              className="flex items-center gap-2"
              onClick={() => setExpanded(false)}
            >
              <div
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
                style={{ background: "linear-gradient(135deg, #7c3aed, #5b21b6)" }}
              >
                F
              </div>
              <span className="whitespace-nowrap text-sm font-bold tracking-tight">
                <span className="text-violet-400">FANKO</span>
                <span className="ml-1 font-medium text-slate-400">CRM</span>
              </span>
            </Link>
          )}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors"
            aria-label={expanded ? "사이드바 닫기" : "사이드바 열기"}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </div>

        {/* 내비게이션 */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <SidebarNav
            collapsed={!expanded}
            onNavigate={expanded ? () => undefined : undefined}
          />
        </div>

        {/* 하단: 언어 선택 + 유저 정보 + 로그아웃 (expanded일 때만) */}
        {expanded && (
          <div className="border-t border-slate-800 px-4 py-4 flex flex-col gap-3">
            {/* 언어 선택 */}
            <div>
              <p className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                언어 / Language
              </p>
              <div className="flex gap-1">
                {LOCALES.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setLocale(value)}
                    className={[
                      "flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                      locale === value
                        ? "bg-violet-700 text-white"
                        : "text-slate-400 hover:bg-slate-800 hover:text-slate-100",
                    ].join(" ")}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* 유저 정보 + 로그아웃 */}
            <div>
              <p className="truncate text-xs text-slate-500">{email}</p>
              <form action={signOut} className="mt-2">
                <button
                  type="submit"
                  className="rounded-md border border-slate-700 px-3 py-1 text-xs text-slate-400 transition hover:bg-slate-800 hover:text-slate-100"
                >
                  로그아웃
                </button>
              </form>
            </div>
          </div>
        )}
      </aside>

      {/* ── 오른쪽 메인 영역 ─────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col bg-zinc-50 dark:bg-zinc-950">
        {/* 필터바 portal 슬롯 */}
        <div id="crm-subheader-portal" className="shrink-0" />

        {/* 페이지 콘텐츠 */}
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
