"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// ── 네비게이션 아이템 타입 ────────────────────────────────────────────────
type NavItem = {
  label: string;
  href: string;
  icon: React.ReactNode;
  disabled?: boolean;
};

// ── 섹션별 nav 정의 ───────────────────────────────────────────────────────
const ORDER_NAV: NavItem[] = [
  { label: "주문 목록",  href: "/orders",      icon: <IconList /> },
  { label: "신규 주문",  href: "/orders/new",  icon: <IconPlus /> },
  { label: "배송 관리",  href: "/shipping",    icon: <IconTruck /> },
  { label: "변경 이력",  href: "/history",     icon: <IconClock /> },
];

const FINANCE_NAV: NavItem[] = [
  { label: "재무 대시보드", href: "/finance",           icon: <IconChart /> },
  { label: "수입 내역",    href: "/finance/income",     icon: <IconArrowUp /> },
  { label: "지출 내역",    href: "/finance/expense",    icon: <IconArrowDown /> },
  { label: "환전 환율",    href: "/finance/exchange",   icon: <IconExchange /> },
];

// ── 메인 SidebarNav ───────────────────────────────────────────────────────
export function SidebarNav({
  onNavigate,
  collapsed = false,
}: {
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const pathname = usePathname();

  function isActive(href: string): boolean {
    if (href === "/orders") {
      return (
        pathname === "/orders" ||
        (pathname.startsWith("/orders/") && !pathname.startsWith("/orders/new"))
      );
    }
    return pathname === href || pathname.startsWith(href + "/");
  }

  // 접힌 상태: 아이콘만 세로로 나열
  if (collapsed) {
    return (
      <div className="flex flex-col gap-0.5 py-2">
        {[...ORDER_NAV, ...FINANCE_NAV].map((item) => (
          <NavItemRow
            key={item.href}
            item={item}
            active={isActive(item.href)}
            onNavigate={onNavigate}
            collapsed
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <NavSection label="러시아 주문">
        {ORDER_NAV.map((item) => (
          <NavItemRow
            key={item.href}
            item={item}
            active={isActive(item.href)}
            onNavigate={onNavigate}
          />
        ))}
      </NavSection>

      <NavSection label="재무">
        {FINANCE_NAV.map((item) => (
          <NavItemRow
            key={item.href}
            item={item}
            active={isActive(item.href)}
            onNavigate={onNavigate}
          />
        ))}
      </NavSection>
    </div>
  );
}

// ── NavSection ────────────────────────────────────────────────────────────
function NavSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-3 py-2">
      <p className="mb-1 px-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
        {label}
      </p>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

// ── NavItemRow ────────────────────────────────────────────────────────────
function NavItemRow({
  item,
  active,
  onNavigate,
  collapsed = false,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  if (item.disabled) {
    return (
      <span
        title={collapsed ? item.label : undefined}
        className={
          collapsed
            ? "flex h-9 cursor-not-allowed items-center justify-center opacity-30 select-none"
            : "flex cursor-not-allowed items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-600 opacity-40 select-none"
        }
      >
        <span className="shrink-0">{item.icon}</span>
        {!collapsed && item.label}
      </span>
    );
  }

  if (collapsed) {
    return (
      <Link
        href={item.href}
        onClick={onNavigate}
        title={item.label}
        className={`mx-1.5 flex h-9 items-center justify-center rounded-lg transition-colors ${
          active
            ? "bg-violet-900/50 text-violet-300"
            : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
        }`}
      >
        <span className="shrink-0">{item.icon}</span>
      </Link>
    );
  }

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
        active
          ? "bg-violet-900/50 font-semibold text-violet-300"
          : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
      }`}
    >
      <span className="shrink-0">{item.icon}</span>
      {item.label}
    </Link>
  );
}

// ── SVG 아이콘 ────────────────────────────────────────────────────────────
function IconList() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path d="M4 4h12v2H4V4zm0 5h12v2H4V9zm0 5h12v2H4v-2z" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" />
    </svg>
  );
}

function IconTruck() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
      <path d="M3 4a1 1 0 00-1 1v9a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1v-1h3.05a2.5 2.5 0 014.9 0H19a1 1 0 001-1v-4a1 1 0 00-.293-.707L17 5.586A1 1 0 0016.293 5H11V4a1 1 0 00-1-1H3z" />
    </svg>
  );
}

function IconClock() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function IconChart() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zm6-4a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zm6-3a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
    </svg>
  );
}

function IconArrowUp() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function IconArrowDown() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function IconExchange() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M4 4a1 1 0 000 2h8.586L11.293 7.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L12.586 4H4zm12 12a1 1 0 000-2H7.414l1.293-1.293a1 1 0 10-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L7.414 16H16z"
        clipRule="evenodd"
      />
    </svg>
  );
}
