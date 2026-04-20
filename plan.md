# UI 리디자인 계획 — 대안2 사이드바 + 대안4 통계 카드

> 목표 ①: 현재 상단 탭 내비게이션 → **대안2 스타일 다크 사이드바**로 교체  
> 목표 ②: 주문 목록 최상단에 **대안4 스타일 통계 카드** 4개 추가  
> 목표 ③: 모바일에서는 작은 메뉴 아이콘 → **좌측 슬라이드인 사이드바**

---

## 1. 접근방식

### 1-1. 변경 범위

| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `components/crm-shell.tsx` | **전면 수정** | 상단 헤더 제거 → 좌측 사이드바 + 모바일 토글 |
| `components/nav-menu.tsx` | **전면 수정** | 수평 탭 → 아이콘+텍스트 수직 nav 아이템 |
| `components/orders-ag-grid-table.tsx` | **소폭 추가** | 그리드 위에 통계 카드 4개 |
| `app/orders/layout.tsx` 외 4개 | **유지** | CrmShell을 그대로 사용하므로 변경 불필요 |

### 1-2. 레이아웃 구조 비교

```
[현재]
┌────────────────────────────────────────────────┐
│ header (top-sticky, 52px)                      │
│   FANKO CRM   [주문목록] [재무관리]  [아바타]  │
├────────────────────────────────────────────────┤
│ #crm-subheader-portal (filter bar, sticky)     │
├────────────────────────────────────────────────┤
│ <main> page content                            │
└────────────────────────────────────────────────┘

[변경 후]
┌──────────┬───────────────────────────────────────┐
│          │  topbar (mobile only: 52px)            │
│ sidebar  ├───────────────────────────────────────┤
│  (220px) │  #crm-subheader-portal (filter bar)   │
│  dark    ├───────────────────────────────────────┤
│  fixed   │  통계 카드 4개 (orders 페이지만)       │
│          ├───────────────────────────────────────┤
│          │  <main> page content                  │
└──────────┴───────────────────────────────────────┘
```

### 1-3. 대안2 사이드바 구조 (HTML 원본 분석)

```
.a2-sidebar (width:220px, bg:#0f172a)
  ├── .a2-logo          — "FANKO" + "CRM v2" 부제목
  ├── .a2-nav-section   — "러시아 주문" 섹션
  │     ├── 주문 목록   (icon + text, active 시 bg:#1e1b4b, color:#a78bfa)
  │     ├── 신규 주문
  │     ├── 배송 관리
  │     └── 변경 이력
  ├── .a2-nav-section   — "재무" 섹션
  │     ├── 재무 대시보드
  │     └── 수입/지출 내역
  └── 하단 user 영역    — email + 로그아웃
```

### 1-4. 대안4 통계 카드 구조 (HTML 원본 분석)

```
.a4-stats (bg:#f1f5f9, padding:14px 24px, flex, gap:12px)
  ├── .a4-stat.highlight  — 진행 중 주문 (색상 강조)
  ├── .a4-stat            — 표시 상품 라인
  ├── .a4-stat            — IN DELIVERY 건수
  └── .a4-stat            — 잔금 있는 상품
```

### 1-5. 모바일 동작

```
모바일 (< lg = 1024px)
  ├── 사이드바: transform: translateX(-100%)  [기본: 숨김]
  ├── topbar 52px 표시 (모바일 전용)
  │     ├── [☰] 메뉴 버튼 (좌측)
  │     └── FANKO CRM 로고 + 새 주문 버튼 (우측)
  └── [☰] 클릭 시
        ├── 사이드바: translateX(0)  [슬라이드인]
        └── 반투명 오버레이 표시 (클릭 시 닫힘)

데스크탑 (≥ lg)
  ├── 사이드바: 항상 표시 (position static, flex-shrink-0)
  └── topbar: hidden
```

---

## 2. 코드 스니펫

### 2-1. `components/crm-shell.tsx` (전체 교체)

```tsx
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
      {/* ── 모바일 오버레이 ─────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── 사이드바 ────────────────────────────────────────── */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 flex w-56 flex-col
          border-r border-slate-800 bg-slate-900
          transition-transform duration-200
          lg:static lg:translate-x-0
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        {/* 로고 */}
        <div className="border-b border-slate-800 px-5 py-5">
          <Link href="/orders" className="block">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-600 text-xs font-bold text-white">
                F
              </div>
              <span className="text-sm font-bold text-violet-400 tracking-tight">
                FANKO <span className="font-medium text-slate-400">CRM</span>
              </span>
            </div>
          </Link>
        </div>

        {/* 내비게이션 */}
        <div className="flex-1 overflow-y-auto py-3">
          <SidebarNav onNavigate={() => setSidebarOpen(false)} />
        </div>

        {/* 하단 유저 영역 */}
        <div className="border-t border-slate-800 px-5 py-4">
          <p className="truncate text-xs text-slate-500">{email}</p>
          <form action={signOut} className="mt-2">
            <button
              type="submit"
              className="rounded border border-slate-700 px-3 py-1 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition"
            >
              로그아웃
            </button>
          </form>
        </div>
      </aside>

      {/* ── 메인 영역 ───────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden bg-zinc-50 dark:bg-zinc-950">
        {/* 모바일 topbar */}
        <header className="flex h-[52px] items-center gap-3 border-b border-zinc-200 bg-white px-4 lg:hidden dark:border-zinc-800 dark:bg-zinc-900">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            aria-label="메뉴 열기"
          >
            {/* 햄버거 아이콘 */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <span className="text-sm font-bold text-zinc-800 dark:text-zinc-100">FANKO CRM</span>
          <Link
            href="/orders/new"
            className="ml-auto flex items-center gap-1 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            + 새 주문
          </Link>
        </header>

        {/* 필터바 portal 슬롯 */}
        <div id="crm-subheader-portal" className="z-30 flex-none" />

        {/* 페이지 콘텐츠 */}
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
```

### 2-2. `components/nav-menu.tsx` (전체 교체 → SidebarNav)

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  label: string;
  href: string;
  icon: React.ReactNode;
  disabled?: boolean;
};

const ORDER_NAV: NavItem[] = [
  {
    label: "주문 목록",
    href: "/orders",
    icon: <IconList />,
  },
  {
    label: "신규 주문",
    href: "/orders/new",
    icon: <IconPlus />,
  },
  {
    label: "배송 관리",
    href: "/shipping",
    icon: <IconTruck />,
    disabled: true,
  },
  {
    label: "변경 이력",
    href: "/history",
    icon: <IconClock />,
    disabled: true,
  },
];

const FINANCE_NAV: NavItem[] = [
  {
    label: "재무 대시보드",
    href: "/finance",
    icon: <IconChart />,
  },
  {
    label: "수입 내역",
    href: "/finance/income",
    icon: <IconArrowUp />,
  },
  {
    label: "지출 내역",
    href: "/finance/expense",
    icon: <IconArrowDown />,
  },
];

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/orders") return pathname === href || pathname.startsWith("/orders/") && !pathname.startsWith("/orders/new");
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <div className="flex flex-col gap-0">
      {/* 섹션 1: 러시아 주문 */}
      <NavSection label="러시아 주문">
        {ORDER_NAV.map((item) => (
          <NavItem
            key={item.href}
            item={item}
            active={isActive(item.href)}
            onNavigate={onNavigate}
          />
        ))}
      </NavSection>

      {/* 섹션 2: 재무 */}
      <NavSection label="재무">
        {FINANCE_NAV.map((item) => (
          <NavItem
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

function NavSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-3 py-2">
      <p className="mb-1 px-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
        {label}
      </p>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

function NavItem({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
}) {
  if (item.disabled) {
    return (
      <span className="flex cursor-not-allowed items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-600 opacity-50 select-none">
        {item.icon}
        {item.label}
      </span>
    );
  }

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${
        active
          ? "bg-violet-900/40 font-medium text-violet-300"
          : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
      }`}
    >
      {item.icon}
      {item.label}
    </Link>
  );
}

/* ── SVG 아이콘 ──────────────────────────────────────────── */
function IconList() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
      <path d="M4 4h12v2H4V4zm0 5h12v2H4V9zm0 5h12v2H4v-2z" />
    </svg>
  );
}
function IconPlus() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
      <path d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" />
    </svg>
  );
}
function IconTruck() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
      <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
      <path d="M3 4a1 1 0 00-1 1v9a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1v-1h3.05a2.5 2.5 0 014.9 0H19a1 1 0 001-1v-4a1 1 0 00-.293-.707L17 5.586A1 1 0 0016.293 5H11V4a1 1 0 00-1-1H3z" />
    </svg>
  );
}
function IconClock() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
    </svg>
  );
}
function IconChart() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
      <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zm6-4a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zm6-3a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
    </svg>
  );
}
function IconArrowUp() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
    </svg>
  );
}
function IconArrowDown() {
  return (
    <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  );
}
```

### 2-3. 통계 카드 — `components/orders-ag-grid-table.tsx` 내 추가

`rowData` 계산 이후, AG Grid div 위에 삽입:

```tsx
// allRows 기반 통계 (필터 미적용 전체 데이터)
const stats = useMemo(() => {
  const activeOrderNums = new Set(
    allRows
      .filter((r) => r.item_progress !== "DONE" && r.item_progress !== "CANCEL")
      .map((r) => r.order_num),
  );
  const inDelivery = allRows.filter((r) => r.item_progress === "IN DELIVERY").length;
  const withBalance = allRows.filter((r) => r.extra_payment_rub > 0).length;
  return {
    activeOrders: activeOrderNums.size,
    totalLines: allRows.length,
    inDelivery,
    withBalance,
  };
}, [allRows]);

// JSX — AG Grid div 바로 위에 삽입
<div className="flex gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/50">
  <StatCard value={stats.activeOrders} label="진행 중 주문" accent />
  <StatCard value={stats.totalLines}   label="전체 상품 라인" />
  <StatCard value={stats.inDelivery}   label="IN DELIVERY" />
  <StatCard value={stats.withBalance}  label="잔금 있는 상품" />
</div>

// StatCard 서브 컴포넌트
function StatCard({ value, label, accent }: { value: number; label: string; accent?: boolean }) {
  return (
    <div className="flex-1 rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm dark:border-zinc-700 dark:bg-zinc-800">
      <div className={`text-2xl font-extrabold ${accent ? "text-violet-600 dark:text-violet-400" : "text-zinc-900 dark:text-zinc-100"}`}>
        {value}
      </div>
      <div className="mt-0.5 text-xs text-zinc-400">{label}</div>
    </div>
  );
}
```

---

## 3. 파일 경로

### 수정 파일

| 파일 | 변경 내용 |
|------|-----------|
| `components/crm-shell.tsx` | 상단 헤더 → 다크 사이드바 + 모바일 토글 |
| `components/nav-menu.tsx` | 수평 탭 → `SidebarNav` 수직 아이콘+텍스트 |
| `components/orders-ag-grid-table.tsx` | 통계 카드 4개 + `StatCard` 서브 컴포넌트 추가 |

### 유지 파일 (변경 없음)

| 파일 | 이유 |
|------|------|
| `app/orders/layout.tsx` | `CrmShell`을 그대로 사용 |
| `app/finance/layout.tsx` | 동일 |
| `app/history/layout.tsx` | 동일 |
| `app/shipping/layout.tsx` | 동일 |
| `lib/actions/*` | 데이터 레이어 무변경 |
| `lib/orders-ag-grid-types.ts` | 타입 무변경 |

---

## 4. 트레이드오프 상세 설명

### 4-1. 사이드바 고정 방식 (fixed vs static)

| | **fixed + lg:static (채택)** | flex-shrink-0 항상 표시 |
|---|---|---|
| 모바일 동작 | 슬라이드인/아웃 가능 | 사이드바가 항상 공간 차지 |
| 구현 복잡도 | 약간 높음 (z-index, translate) | 단순 |
| 모바일 UX | 전체 화면 사용 가능 | 공간 낭비 |

`fixed` + `lg:static` 조합: 모바일에서는 오버레이로 떠 있고, 데스크탑에서는 일반 flex item으로 동작.  
`-translate-x-full` ↔ `translate-x-0` 전환으로 슬라이드 애니메이션.

### 4-2. 통계 데이터 소스

| | **allRows 기반 (채택)** | Server에서 계산 |
|---|---|---|
| 실시간성 | 클라이언트 상태 즉시 반영 | 페이지 새로고침 필요 |
| 서버 부하 | 없음 | 추가 쿼리 1회 |
| 정확성 | 이미 로드된 데이터 | DB 실시간 |

`orders-ag-grid-table.tsx`가 이미 전체 주문 데이터를 `allRows`로 갖고 있으므로 추가 쿼리 없이 계산 가능.  
단, 다른 사용자가 동시에 데이터를 변경해도 반영되지 않는 점은 기존 테이블과 동일한 수준.

### 4-3. 모바일 topbar 중복 가능성

현재 `CrmShell`에 모바일 전용 topbar를 추가하면 모든 페이지(재무, 이력 등)에서도 표시됨.
각 페이지에서 일관된 경험을 제공하므로 이는 의도된 동작.

단, `#crm-subheader-portal`의 `top` 오프셋이 이전에는 `52px` (헤더 높이)였는데,
사이드바 레이아웃에서는 모바일만 topbar가 있으므로 portal 슬롯을 `flex-none`으로 처리하면 자연스럽게 흐름 내 위치.

현재 `orders-ag-grid-table.tsx`의 AG Grid 높이:
```tsx
// Before (상단 헤더 기준 오프셋)
style={{ height: "calc(100vh - 108px)", width: "100%" }}

// After (topbar 없는 데스크탑: 필터바 높이 ~50px만 감산)
style={{ height: "calc(100vh - 50px)", width: "100%" }}
// 모바일: topbar(52px) + 필터바(50px) = 102px
// → CSS로 처리: h-[calc(100vh-50px)] lg:h-[calc(100vh-50px)]
```

`crm-stats-portal` 없이 그리드 컴포넌트 내부에 통계를 렌더링하므로, 통계 카드 높이(약 72px)만큼 그리드 높이도 조정 필요.

### 4-4. 다크 테마 사이드바와 라이트 메인 영역 공존

사이드바는 `bg-slate-900`(다크)이고 메인 영역은 `bg-zinc-50`(라이트).
Tailwind `dark:` 모드와 무관하게 사이드바는 항상 다크이므로 사이드바 내부에는 `dark:` 클래스 불필요.
메인 영역은 기존 다크 모드 지원 유지.

---

## 5. 구현 순서

```
Phase 1 — CrmShell 교체 (1일)
  [x] components/crm-shell.tsx 전면 재작성 (사이드바 + 모바일 토글)
  [x] components/nav-menu.tsx → SidebarNav 로 전면 재작성 (아이콘+텍스트 수직)
  [x] typecheck 통과 확인

Phase 2 — 통계 카드 추가 (0.5일)
  [x] components/orders-ag-grid-table.tsx — StatCard 컴포넌트 + stats 계산
  [x] AG Grid 높이 calc 조정 → CSS Grid (height: 100% / h-full 방식)
  [x] typecheck 통과 확인

Phase 3 — 검증 (0.5일)
  [ ] 데스크탑: 사이드바 고정, 메인 콘텐츠 표시 확인
  [ ] 모바일: 메뉴 아이콘 → 슬라이드인 → 오버레이 닫힘 확인
  [ ] 재무/이력/배송 페이지에서도 사이드바 정상 작동 확인
  [ ] npm run build 오류 없음 확인
```

---

## 6. 미결 결정 사항

| 항목 | 선택지 | 결정 필요 시점 |
|------|--------|---------------|
| 통계 카드 위치 | 필터바 위 / 필터바 아래 | Phase 2 |
| AG Grid height 조정 | calc 직접 수정 / CSS Grid로 레이아웃 | Phase 2 |
| 사이드바 너비 | 220px(대안2 그대로) / 240px | Phase 1 |
