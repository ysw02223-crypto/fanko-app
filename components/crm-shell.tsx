"use client";

import { signOut } from "@/lib/actions/auth";
import Link from "next/link";
import { useState } from "react";
import { SidebarNav } from "@/components/nav-menu";

export function CrmShell({
  email,
  children,
}: {
  email: string;
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950">
      {/* ── 모바일 오버레이 (사이드바 열렸을 때 배경 딤) ────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── 좌측 사이드바 (240px) ────────────────────────────────────────── */}
      <aside
        className={[
          "fixed inset-y-0 left-0 z-50 flex w-60 flex-col",
          "border-r border-slate-800 bg-slate-900",
          "transition-transform duration-200 ease-in-out",
          "lg:static lg:translate-x-0 lg:z-auto",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        {/* 로고 */}
        <div className="flex items-center gap-2.5 border-b border-slate-800 px-5 py-[14px]">
          <Link href="/orders" className="flex items-center gap-2" onClick={() => setSidebarOpen(false)}>
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
              style={{ background: "linear-gradient(135deg, #7c3aed, #5b21b6)" }}
            >
              F
            </div>
            <span className="text-sm font-bold tracking-tight">
              <span className="text-violet-400">FANKO</span>
              <span className="ml-1 font-medium text-slate-400">CRM</span>
            </span>
          </Link>
        </div>

        {/* 내비게이션 */}
        <div className="flex-1 overflow-y-auto">
          <SidebarNav onNavigate={() => setSidebarOpen(false)} />
        </div>

        {/* 하단: 유저 정보 + 로그아웃 */}
        <div className="border-t border-slate-800 px-5 py-4">
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
      </aside>

      {/* ── 오른쪽 메인 영역 ─────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col bg-zinc-50 dark:bg-zinc-950">
        {/* 모바일 전용 topbar (lg 이상에서는 숨김) */}
        <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-zinc-200 bg-white px-4 lg:hidden dark:border-zinc-800 dark:bg-zinc-900">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            aria-label="사이드바 열기"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
            <span className="text-violet-600">FANKO</span> CRM
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/orders/new"
              className="flex items-center gap-1 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
            >
              <span className="text-sm leading-none">+</span>
              <span>새 주문</span>
            </Link>
          </div>
        </header>

        {/* 필터바 portal 슬롯 (sticky 서브헤더 대상) */}
        <div id="crm-subheader-portal" className="shrink-0" />

        {/* 페이지 콘텐츠 */}
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
