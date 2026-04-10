# FANKO CRM 재무관리 전면 재설계 계획

## 개요

현재 5개 페이지(대시보드·한국내역·러시아내역·환전관리·계좌현황) 체계를
**6개 영역**(재무 대시보드·수입목록·수입추가·지출목록·지출추가·환율)으로 재설계한다.
핵심 변경은 단순 카테고리 분류에서 **주문목록 자동 동기화** + **루블/원화 이중통화 지원**으로의 전환이다.

기존 `/finance/korea`, `/finance/russia`, `/finance/accounts` 페이지는
**라우트 유지, 네비게이션에서만 제거** (데이터 보존 + 롤백 가능).

---

## Phase 0: DB 스키마 변경

### 0-1. fin_exchange_records — `person` → `description` rename [ ]

**접근방식**  
Supabase `mcp__supabase__apply_migration`으로 컬럼 rename 후
TypeScript 타입·컴포넌트 일괄 수정.

```sql
ALTER TABLE fin_exchange_records
  RENAME COLUMN person TO description;
```

**파일경로**
- `lib/schema.ts` — `FinExchangeRecord.person` → `description`
- `components/fin-exchange-table.tsx` — `form.person` → `form.description`, 레이블 "대리인" → "내용"
- `lib/actions/finance.ts` — payload 필드명 수정

**트레이드오프**  
컬럼명만 변경이므로 데이터 손실 없음.
Supabase에서 TypeScript 타입 재생성 필요.

---

### 0-2. fin_income_records 테이블 신규 생성 [ ]

**접근방식**  
주문목록과 `order_item_id` FK로 1:1 연결. `source` 컬럼으로 자동/수동 구분.
`ON DELETE CASCADE`로 order_item 삭제 시 income_record 자동 제거.

```sql
CREATE TABLE fin_income_records (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date             date         NOT NULL,
  category         text         NOT NULL
                   CHECK (category IN ('러시아판매','도매','국내판매','기타')),
  sub_category     text,
  product_name     text         NOT NULL,
  product_type     text,                    -- Cosmetic|Clothes|Toy|ETC (러시아판매 전용)
  sale_currency    text         NOT NULL CHECK (sale_currency IN ('KRW','RUB')),
  sale_amount      numeric      NOT NULL,   -- 원래 통화 기준 판매가
  sale_rate        numeric,                 -- RUB일 때 환율 (기본 16.5)
  sale_krw         numeric,                 -- 서버 계산: KRW면 그대로, RUB면 *rate
  purchase_currency text        NOT NULL CHECK (purchase_currency IN ('KRW','RUB')),
  purchase_amount  numeric      NOT NULL,
  purchase_rate    numeric,
  purchase_krw     numeric,
  profit_krw       numeric,                 -- sale_krw - purchase_krw
  source           text         NOT NULL DEFAULT 'manual'
                   CHECK (source IN ('order','manual')),
  order_item_id    uuid REFERENCES order_items(id) ON DELETE CASCADE,
  note             text,
  created_at       timestamptz  DEFAULT now(),
  updated_at       timestamptz  DEFAULT now()
);

CREATE INDEX idx_fin_income_date     ON fin_income_records (date);
CREATE INDEX idx_fin_income_item     ON fin_income_records (order_item_id);
CREATE UNIQUE INDEX idx_fin_income_order_item_uniq
  ON fin_income_records (order_item_id)
  WHERE order_item_id IS NOT NULL;
```

**파일경로**
- `lib/schema.ts` — `FinIncomeRecord` 타입 추가
- `lib/actions/finance-income.ts` — CRUD Server Actions (신규)

**트레이드오프**  
`source='order'` 행은 UI에서 삭제 버튼 숨기고 주문목록 수정 유도.
order_item_id unique index로 중복 동기화 방지.

---

### 0-3. fin_expense_records 테이블 신규 생성 [ ]

**접근방식**  
KRW/RUB 통합 단일 테이블. `currency`로 국내/국외 운영비 집계 구분.
배송비 자동 등록은 `source='order'`, `order_num` FK.

```sql
CREATE TABLE fin_expense_records (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date             date         NOT NULL,
  major_category   text         NOT NULL,
  mid_category     text,
  minor_category   text,
  description      text         NOT NULL,
  currency         text         NOT NULL CHECK (currency IN ('KRW','RUB')),
  amount           numeric      NOT NULL,
  rate             numeric,                -- RUB일 때 환율 (기본 16.5)
  amount_krw       numeric,               -- 서버 계산
  memo             text,
  source           text         NOT NULL DEFAULT 'manual'
                   CHECK (source IN ('order','manual')),
  order_num        text REFERENCES orders(order_num) ON DELETE CASCADE,
  created_at       timestamptz  DEFAULT now(),
  updated_at       timestamptz  DEFAULT now()
);

CREATE INDEX idx_fin_expense_date  ON fin_expense_records (date);
CREATE INDEX idx_fin_expense_order ON fin_expense_records (order_num);

-- 배송비 중복 방지: 주문별 order 행은 1개만
CREATE UNIQUE INDEX idx_fin_expense_order_sync
  ON fin_expense_records (order_num)
  WHERE source = 'order';
```

**파일경로**
- `lib/schema.ts` — `FinExpenseRecord` 타입 추가
- `lib/actions/finance-expense.ts` — CRUD Server Actions (신규)

---

## Phase 1: 타입 및 카테고리 정의

### 1-1. lib/schema.ts — 새 타입 추가 [ ]

```typescript
export type FinIncomeRecord = {
  id: string;
  date: string;
  category: "러시아판매" | "도매" | "국내판매" | "기타";
  sub_category: string | null;
  product_name: string;
  product_type: string | null;
  sale_currency: "KRW" | "RUB";
  sale_amount: number;
  sale_rate: number | null;
  sale_krw: number | null;
  purchase_currency: "KRW" | "RUB";
  purchase_amount: number;
  purchase_rate: number | null;
  purchase_krw: number | null;
  profit_krw: number | null;
  source: "order" | "manual";
  order_item_id: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type FinExpenseRecord = {
  id: string;
  date: string;
  major_category: string;
  mid_category: string | null;
  minor_category: string | null;
  description: string;
  currency: "KRW" | "RUB";
  amount: number;
  rate: number | null;
  amount_krw: number | null;
  memo: string | null;
  source: "order" | "manual";
  order_num: string | null;
  created_at: string;
  updated_at: string;
};

// FinExchangeRecord — person → description
export type FinExchangeRecord = {
  id: string;
  date: string;
  description: string;    // formerly: person
  rub_amount: number;
  exchange_rate: number;
  krw_amount: number;
  book_rate: number | null;
  fx_profit: number | null;
  note: string | null;
  created_at: string;
};
```

**파일경로**: `lib/schema.ts`

---

### 1-2. lib/finance-categories.ts — 통합 지출 카테고리 추가 [ ]

**접근방식**  
2025 Korea.xlsx + 2025 Russia.xlsx의 지출 분류를 기반으로 통합 3단계 계층 구성.
`국제 배송비`는 order 자동 동기화용 고정 대분류 키로 사용.
`DEFAULT_RUB_RATE = 16.5` 상수 추가.

```typescript
// 기존 내용 유지 + 추가
export const EXPENSE_CATEGORIES: Record<string, Record<string, string[]>> = {
  // ── 국내 (KRW) ─────────────────────────────────────────
  "국내 판매원가": {
    "화장품": ["올리브영","공식몰","네이버","도매","팝업","번개장터","쿠팡","기타"],
    "앨범": ["공식몰","네이버","번개장터","기타"],
    "명품": ["후르츠","번개장터","공식몰","기타"],
    "전자기기": ["공식몰","기타"],
    "기타제품": ["기타"],
  },
  "국내 운영비": {
    "서비스비용": ["국내택배","포장재비","증정용품비","홍보물제작","기타"],
    "정기결제": ["Canva","GPT","네이버","통신비","쿠팡","기타"],
    "과실비용": ["배송오류","상품손상","피해보상","기타"],
    "유형자산": ["전자기기","설비","사무기기"],
    "세금": ["부가세","소득세","기타"],
  },
  "상품권 구매": {
    "올리브영": ["구매"],
    "문화상품권": ["구매"],
  },
  "국내 개인운용": {
    "선물": ["기타"],
    "대출": ["상환","기타"],
  },
  // ── 국외 (RUB) ─────────────────────────────────────────
  "국제 배송비": {   // order 자동 동기화 고정 키
    "쉽코르": [],
    "우체국": [],
    "기타": [],
  },
  "러시아 인건비": {
    "월급": [],
    "상여금": [],
    "외주": [],
  },
  "러시아 수수료": {
    "Avito": [],
    "기타": [],
  },
  "러시아 포장비": {
    "박스": [],
    "에어캡": [],
    "기타": [],
  },
  "러시아 광고비": {
    "Telegram": [],
    "기타": [],
  },
  "러시아 운영비": {
    "대금결제": ["대리수취","기타"],
    "과실비": ["피해보상","기타"],
  },
  "러시아 개인운용": {
    "대출상환": [],
    "선물": [],
  },
};

export const INCOME_CATEGORIES = ["러시아판매","도매","국내판매","기타"] as const;
export type IncomeCategory = (typeof INCOME_CATEGORIES)[number];

export const DEFAULT_RUB_RATE = 16.5;
```

**파일경로**: `lib/finance-categories.ts`

---

## Phase 2: Server Actions

### 2-1. lib/actions/finance-income.ts — 수입 CRUD (신규) [ ]

**접근방식**  
`deleteIncomeRecord`에서 `source='order'` 행 삭제 거부.
`getIncomeRecords`는 월별 조회 + category 필터 옵션.
computed 필드(`sale_krw`, `purchase_krw`, `profit_krw`)는 서버에서 계산 후 저장.

```typescript
"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { FinIncomeRecord } from "@/lib/schema";

export type IncomeRecordPayload = Omit<
  FinIncomeRecord,
  "id" | "created_at" | "updated_at" | "source" | "order_item_id"
  | "sale_krw" | "purchase_krw" | "profit_krw"
>;

function computeKrwFields(p: IncomeRecordPayload) {
  const saleKrw   = p.sale_currency === "KRW"
    ? p.sale_amount
    : p.sale_amount * (p.sale_rate ?? 16.5);
  const buyKrw    = p.purchase_currency === "KRW"
    ? p.purchase_amount
    : p.purchase_amount * (p.purchase_rate ?? 16.5);
  return {
    sale_krw:     Math.round(saleKrw),
    purchase_krw: Math.round(buyKrw),
    profit_krw:   Math.round(saleKrw - buyKrw),
  };
}

export async function getIncomeRecords(yearMonth: string): Promise<FinIncomeRecord[]> { ... }
export async function upsertIncomeRecord(p: IncomeRecordPayload, id?: string): Promise<{ error?: string }> { ... }
export async function deleteIncomeRecord(id: string): Promise<{ error?: string }> {
  // source='order' 거부
}
```

**파일경로**: `lib/actions/finance-income.ts` (신규)

---

### 2-2. lib/actions/finance-expense.ts — 지출 CRUD (신규) [ ]

**접근방식**  
`amount_krw` 서버에서 계산 저장.
`syncOrderShippingToExpense(supabase, orderNum, date, fee)` 함수를 내부에 두고
`orders.ts`에서 같은 supabase 클라이언트로 직접 호출.

```typescript
"use server";

export type ExpenseRecordPayload = Omit<
  FinExpenseRecord,
  "id" | "created_at" | "updated_at" | "source" | "order_num" | "amount_krw"
>;

export async function getExpenseRecords(yearMonth: string): Promise<FinExpenseRecord[]> { ... }
export async function upsertExpenseRecord(p: ExpenseRecordPayload, id?: string): Promise<{ error?: string }> {
  const amount_krw = p.currency === "KRW"
    ? p.amount
    : Math.round(p.amount * (p.rate ?? 16.5));
  // insert with source='manual', amount_krw
}
export async function deleteExpenseRecord(id: string): Promise<{ error?: string }> {
  // source='order' 거부
}
```

**파일경로**: `lib/actions/finance-expense.ts` (신규)

---

### 2-3. lib/actions/orders.ts — income/expense 동기화 추가 [ ]

**접근방식**  
`createOrderWithItemsAction` 성공 후 각 item에 대해 `fin_income_records` upsert.
`updateOrder` — date 변경 시 연결된 income_records의 date도 업데이트.
shipping_fee 변경 시 `fin_expense_records` upsert (order_num 기준).

```typescript
// createOrderWithItemsAction — items 삽입 후 추가
const { data: insertedItems } = await supabase
  .from("order_items")
  .select("id, product_name, product_type, price_rub, krw")
  .eq("order_num", order_num);

for (const item of insertedItems ?? []) {
  const saleKrw = Math.round(Number(item.price_rub) * 16.5);
  const buyKrw  = Number(item.krw ?? 0);
  await supabase.from("fin_income_records").upsert({
    date,
    category: "러시아판매",
    sub_category: null,
    product_name: item.product_name,
    product_type: item.product_type ?? null,
    sale_currency: "RUB",
    sale_amount: Number(item.price_rub),
    sale_rate: 16.5,
    sale_krw: saleKrw,
    purchase_currency: "KRW",
    purchase_amount: buyKrw,
    purchase_rate: null,
    purchase_krw: buyKrw,
    profit_krw: saleKrw - buyKrw,
    source: "order",
    order_item_id: item.id,
    note: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "order_item_id" });
}
revalidatePath("/finance/income");
```

**파일경로**: `lib/actions/orders.ts`

---

### 2-4. lib/actions/order-items.ts — income sync 추가 [ ]

**접근방식**  
`updateOrderItem` 성공 후 해당 item의 income_record 업데이트.
`price_rub`, `krw`, `product_name`, `product_type` 변경 시 income_record 동기화.

**파일경로**: `lib/actions/order-items.ts`

---

### 2-5. lib/actions/finance.ts — person→description 수정 [ ]

`upsertExchangeRecord` payload에서 `person` → `description`.

**파일경로**: `lib/actions/finance.ts`

---

### 2-6. lib/actions/finance-dashboard.ts — 대시보드 집계 (신규) [ ]

**데이터 소스별 집계 테이블**:

| 지표 | 소스 | 집계 방법 |
|------|------|-----------|
| 국내 운영비 | fin_expense_records | WHERE currency='KRW' → SUM(amount_krw) |
| 국외 운영비 | fin_expense_records | WHERE currency='RUB' → SUM(amount_krw) |
| 수출대금(₽) | order_items JOIN orders | WHERE orders.date IN month → SUM(price_rub) |
| 카테고리별 수익 | fin_income_records | WHERE category='러시아판매' GROUP BY product_type → SUM(profit_krw) |
| 올리브영 수익 | fin_income_records | WHERE category='기타' AND sub_category='올리브영' → SUM(profit_krw) |
| 도매+국내+기타 | fin_income_records | WHERE category IN ('도매','국내판매','기타') → SUM(profit_krw) |
| 환전/환차익 | fin_exchange_records | SUM(krw_amount), SUM(fx_profit) |
| 총 수익 | 계산 | 올리브영 + 환차익 + 전체 profit_krw |

```typescript
export type FinDashboardMonthly = {
  year_month: string;
  expense_domestic_krw: number;   // 국내 운영비
  expense_overseas_krw: number;   // 국외 운영비 (RUB→KRW)
  export_rub: number;             // 수출대금 (루블)
  profit_cosmetic: number;        // 화장품 차익
  profit_album: number;           // 앨범 차익 (product_type 매핑 필요)
  profit_etc: number;             // 기타제품 차익
  profit_oliveyoung: number;      // 올리브영 수익
  profit_domestic: number;        // 도매+국내판매+기타 수익
  exchange_krw: number;           // 총 환전 원화
  fx_profit: number;              // 환차익
  total_profit: number;           // 총 수익
};

export async function getDashboardData(year: number): Promise<FinDashboardMonthly[]> {
  // 해당 연도 전체 조회 후 월별 집계
}
```

**파일경로**: `lib/actions/finance-dashboard.ts` (신규)

---

## Phase 3: 수입목록 페이지

### 3-1. components/income-table.tsx (신규) [ ]

**접근방식**  
주문목록과 유사한 스프레드시트 형태. 필터(분류), 검색(상품명).
`source='order'` 행: 연한 배경(bg-blue-50/dark:bg-blue-950), 수정/삭제 대신 "주문" 링크.

**컬럼 구성**:
```
날짜 | 분류 | 상품명 | 판매가 | 판매환율 | 매입가 | 매입환율 | 차익(원) | 작업
```
- 판매가/매입가: RUB이면 `₽숫자`, KRW이면 `숫자원` 표기
- 환율 칸: RUB 행만 표시, KRW 행은 `—`
- 인라인 편집: `source='manual'` 행만 클릭 수정 가능

**파일경로**: `components/income-table.tsx` (신규)

---

### 3-2. app/finance/income/page.tsx (신규) [ ]

```typescript
import { getIncomeRecords } from "@/lib/actions/finance-income";
import { currentYearMonth } from "@/lib/finance-utils";
import { IncomeTable } from "@/components/income-table";
import { FinMonthSelect } from "@/components/fin-month-select";
import Link from "next/link";

type Props = { searchParams: Promise<{ ym?: string }> };

export default async function FinanceIncomePage({ searchParams }: Props) {
  const { ym } = await searchParams;
  const yearMonth = ym ?? currentYearMonth();
  const rows = await getIncomeRecords(yearMonth);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">수입 목록</h1>
          <p className="text-sm text-zinc-500">러시아판매는 주문목록과 자동 동기화됩니다.</p>
        </div>
        <div className="flex items-center gap-3">
          <FinMonthSelect value={yearMonth} />
          <Link href="/finance/income/new" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500">
            수입 추가
          </Link>
        </div>
      </div>
      <IncomeTable initialRows={rows} yearMonth={yearMonth} />
    </div>
  );
}
```

**파일경로**: `app/finance/income/page.tsx` (신규)

---

## Phase 4: 수입추가 페이지

### 4-1. components/income-add-form.tsx (신규) [ ]

**접근방식**  
주문추가(`OrderCreateForm`)와 유사한 단일 컬럼 카드형 폼.
분류 선택 → 러시아판매 시 `product_type` 필드 추가 노출.
판매가/매입가 각각 [KRW] [RUB] 토글 버튼 + 환율 입력(디폴트 16.5).
원화 환산 실시간 우측 표시.
성공 시 `router.push('/finance/income')`.

**UI 구조**:
```
┌─────────────────────────────────────┐
│  분류        [러시아판매 ▼]          │
│  날짜        [2026-04-11]           │
│  상품명      [___________________]  │
│  상품유형    [Cosmetic ▼]  (러판만)  │
│                                     │
│  판매가   [KRW] [RUB★]             │
│           [_________]  → ₩ 자동계산 │
│           환율 [16.5]               │
│                                     │
│  매입가   [KRW★] [RUB]             │
│           [_________]  → ₩ 자동계산 │
│           환율 [16.5]               │
│                                     │
│  차익    ₩ 자동계산 (실시간)         │
│  메모    [___________________]      │
│                                     │
│          [취소]  [수입 추가]        │
└─────────────────────────────────────┘
```

**파일경로**: `components/income-add-form.tsx` (신규)

---

### 4-2. app/finance/income/new/page.tsx (신규) [ ]

```typescript
import { IncomeAddForm } from "@/components/income-add-form";

export default function FinanceIncomeNewPage() {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">수입 추가</h1>
      <IncomeAddForm />
    </div>
  );
}
```

**파일경로**: `app/finance/income/new/page.tsx` (신규)

---

## Phase 5: 지출목록 페이지

### 5-1. components/expense-table.tsx (신규) [ ]

**접근방식**  
주문목록 스타일. 필터(대분류 전체/국내.../러시아...), 검색(내용).
`source='order'` 행: 연한 배경, 삭제 불가, "주문" 링크.

**컬럼 구성**:
```
날짜 | 대분류 | 중분류 | 소분류 | 내용 | 금액 | 환율 | 원화환산 | 메모 | 작업
```
- 금액: `₽숫자` 또는 `숫자원`
- 환율: RUB 행만 표시
- 원화환산: 항상 표시 (KRW는 금액=원화환산)

**파일경로**: `components/expense-table.tsx` (신규)

---

### 5-2. app/finance/expense/page.tsx (신규) [ ]

```typescript
export default async function FinanceExpensePage({ searchParams }: Props) {
  const { ym } = await searchParams;
  const yearMonth = ym ?? currentYearMonth();
  const rows = await getExpenseRecords(yearMonth);
  return ( /* FinMonthSelect + ExpenseTable + 지출추가 링크 */ );
}
```

**파일경로**: `app/finance/expense/page.tsx` (신규)

---

## Phase 6: 지출추가 페이지

### 6-1. components/expense-add-form.tsx (신규) [ ]

**접근방식**  
수입추가와 동일한 레이아웃.
대/중/소분류 3단 캐스케이딩 셀렉트 — EXPENSE_CATEGORIES 기반.
상위 분류 변경 시 하위 분류 초기화.
비용 KRW/RUB 토글 + 환율 + 원화환산 실시간.

**UI 구조**:
```
┌─────────────────────────────────────┐
│  날짜        [2026-04-11]           │
│  대분류      [국내 운영비 ▼]         │
│  중분류      [서비스비용 ▼]          │
│  소분류      [국내택배 ▼]           │
│  내용        [___________________]  │
│                                     │
│  비용     [KRW★] [RUB]             │
│           [_________]  → ₩ 자동계산 │
│           환율 [16.5]  (RUB일 때)   │
│                                     │
│  메모    [___________________]      │
│                                     │
│          [취소]  [지출 추가]        │
└─────────────────────────────────────┘
```

**파일경로**: `components/expense-add-form.tsx` (신규)

---

### 6-2. app/finance/expense/new/page.tsx (신규) [ ]

**파일경로**: `app/finance/expense/new/page.tsx` (신규)

---

## Phase 7: 환율 페이지 수정

### 7-1. components/fin-exchange-table.tsx 수정 [ ]

**변경사항**:
1. `form.person` → `form.description`, 레이블 "대리인" → "내용", placeholder "이목원, 진실, 큰삼촌…" → "내용 입력"
2. 루블 + 원화 입력 → 환전환율 자동 계산 (역방향 추가)
3. 기존 rate→krw 계산도 유지 (직접 rate 입력 시 krw 갱신)

**변경 set() 로직**:
```typescript
function set(field: keyof FormData, value: string) {
  setForm((prev) => {
    const next = { ...prev, [field]: value };

    // rub + krw → rate 자동계산 (새로 추가)
    if (field === "rub_amount" || field === "krw_amount") {
      const rub = Number(field === "rub_amount" ? value : prev.rub_amount);
      const krw = Number(field === "krw_amount" ? value : prev.krw_amount);
      if (rub > 0 && krw > 0) {
        next.exchange_rate = (krw / rub).toFixed(4);
      }
    }

    // rate → krw 기존 계산 (exchange_rate 직접 수정 시)
    if (field === "exchange_rate") {
      const rub  = Number(prev.rub_amount);
      const rate = Number(value);
      if (rub > 0 && rate > 0) {
        next.krw_amount = String(Math.round(rub * rate));
      }
    }

    // 환차익 자동계산
    const rub  = Number(next.rub_amount);
    const rate = Number(next.exchange_rate);
    const book = Number(next.book_rate);
    if (rub > 0 && rate > 0 && book > 0) {
      next.fx_profit = String(Math.round((rate - book) * rub));
    }
    return next;
  });
}
```

4. `handleSubmit`의 validation에서 `form.person` → `form.description`
5. payload에서 `person: form.person` → `description: form.description`
6. 테이블 헤더 "대리인" → "내용"
7. `row.person` → `row.description`

**파일경로**: `components/fin-exchange-table.tsx`

---

## Phase 8: 재무 대시보드 재설계

### 8-1. lib/actions/finance-dashboard.ts 구현 [ ]

**접근방식**  
연도 단위 조회 (`?year=YYYY`). 12개월 데이터를 병렬 쿼리 후 월별 집계.

```typescript
"use server";
import { createClient } from "@/lib/supabase/server";

export type FinDashboardMonthly = {
  year_month: string;
  expense_domestic_krw: number;   // KRW 지출 합계
  expense_overseas_krw: number;   // RUB 지출의 KRW 환산 합계
  export_rub: number;             // 수출대금 루블 합계
  profit_cosmetic: number;        // Cosmetic 차익
  profit_clothes: number;         // Clothes 차익
  profit_toy: number;             // Toy 차익
  profit_etc_product: number;     // ETC 차익
  profit_oliveyoung: number;      // 기타>올리브영 차익
  profit_domestic_sales: number;  // 도매+국내판매+기타 차익
  exchange_krw: number;           // 총 환전 원화
  fx_profit: number;              // 환차익
  total_profit: number;           // 총 수익
};

export async function getDashboardData(year: number): Promise<FinDashboardMonthly[]> {
  const from = `${year}-01-01`;
  const to   = `${year}-12-31`;
  const [incomeRes, expenseRes, exchangeRes, orderItemsRes] = await Promise.all([
    supabase.from("fin_income_records").select("date,category,sub_category,product_type,profit_krw,sale_krw,purchase_krw").gte("date", from).lte("date", to),
    supabase.from("fin_expense_records").select("date,currency,amount_krw").gte("date", from).lte("date", to),
    supabase.from("fin_exchange_records").select("date,krw_amount,fx_profit").gte("date", from).lte("date", to),
    supabase.from("order_items").select("price_rub, orders!inner(date)").gte("orders.date", from).lte("orders.date", to),
  ]);
  // 월별 집계 후 배열 반환
}
```

**파일경로**: `lib/actions/finance-dashboard.ts` (신규)

---

### 8-2. components/fin-dashboard.tsx 재설계 [ ]

**변경사항**:
- 상단 연도 셀렉터 추가 (`?year=YYYY`, useRouter().push)
- 기존 월별 테이블 컬럼을 새 `FinDashboardMonthly` 구조로 교체
- KPI 섹션: 선택된 연도의 합계 표시
- 바 차트: 수입vs지출, 환차익

**레이아웃**:
```
연도 [2025 ▼]

[총 수익] [수출대금₽] [환차익] [국내운영비] [국외운영비]

┌── 월별 종합 ──────────────────────────────────────────┐
│ 월 │ 국내운영비 │ 국외운영비 │ 화장품 │ 앨범 │ 기타 │ 올리브영 │ 수출대금₽ │ 환전/환차익 │ 총수익 │
└───────────────────────────────────────────────────────┘

[수입/지출 월별 바 차트]
```

**파일경로**: `components/fin-dashboard.tsx`

---

### 8-3. app/finance/page.tsx 수정 [ ]

```typescript
import { getDashboardData } from "@/lib/actions/finance-dashboard";

type Props = { searchParams: Promise<{ year?: string }> };

export default async function FinanceDashboardPage({ searchParams }: Props) {
  const { year } = await searchParams;
  const targetYear = year ? Number(year) : new Date().getFullYear();
  const summaries = await getDashboardData(targetYear);
  return <FinDashboard summaries={summaries} year={targetYear} />;
}
```

**파일경로**: `app/finance/page.tsx`

---

## Phase 9: 네비게이션 업데이트

### 9-1. components/nav-menu.tsx 수정 [ ]

```typescript
// 재무관리 items 교체
{
  label: "재무관리",
  items: [
    { label: "재무 대시보드", href: "/finance" },
    { label: "수입 목록",    href: "/finance/income" },
    { label: "수입 추가",    href: "/finance/income/new" },
    { label: "지출 목록",    href: "/finance/expense" },
    { label: "지출 추가",    href: "/finance/expense/new" },
    { label: "환율",         href: "/finance/exchange" },
  ],
},
```

기존 `/finance/korea`, `/finance/russia`, `/finance/accounts`는 nav에서 제거만 하고 파일 유지.

**파일경로**: `components/nav-menu.tsx`

---

## Phase 10: TypeScript 검증 및 빌드

- [x] `npm run typecheck` — 0 errors
- [x] `npm run build` — 정상 빌드
- [x] GitHub push

---

## 구현 완료 체크리스트

### Phase 0 — DB
- [x] 0-1. fin_exchange_records: person → description rename
- [x] 0-2. fin_income_records 테이블 생성 + indexes
- [x] 0-3. fin_expense_records 테이블 생성 + partial unique index

### Phase 1 — 타입/카테고리
- [x] 1-1. schema.ts — FinIncomeRecord, FinExpenseRecord, FinExchangeRecord(person→description)
- [x] 1-2. finance-categories.ts — EXPENSE_CATEGORIES, INCOME_CATEGORIES, DEFAULT_RUB_RATE

### Phase 2 — Server Actions
- [x] 2-1. lib/actions/finance-income.ts 신규
- [x] 2-2. lib/actions/finance-expense.ts 신규
- [x] 2-3. lib/actions/orders.ts — income sync 추가 (create/update)
- [x] 2-4. lib/actions/order-items.ts — income sync 추가 (update)
- [x] 2-5. lib/actions/finance.ts — person→description
- [x] 2-6. lib/actions/finance-dashboard.ts 신규

### Phase 3 — 수입목록
- [x] 3-1. components/income-table.tsx 신규
- [x] 3-2. app/finance/income/page.tsx 신규

### Phase 4 — 수입추가
- [x] 4-1. components/income-add-form.tsx 신규
- [x] 4-2. app/finance/income/new/page.tsx 신규

### Phase 5 — 지출목록
- [x] 5-1. components/expense-table.tsx 신규
- [x] 5-2. app/finance/expense/page.tsx 신규

### Phase 6 — 지출추가
- [x] 6-1. components/expense-add-form.tsx 신규
- [x] 6-2. app/finance/expense/new/page.tsx 신규

### Phase 7 — 환율 수정
- [x] 7-1. components/fin-exchange-table.tsx — description, 역방향 환율 계산
- [x] 7-2. lib/actions/finance.ts — person→description payload 수정

### Phase 8 — 대시보드
- [x] 8-1. lib/actions/finance-dashboard.ts 구현
- [x] 8-2. components/fin-dashboard.tsx 재설계
- [x] 8-3. app/finance/page.tsx 수정

### Phase 9 — 네비게이션
- [x] 9-1. components/nav-menu.tsx — 6개 항목으로 교체

### Phase 10 — 검증
- [x] typecheck pass
- [x] build pass
- [x] GitHub push

---

## 트레이드오프 종합

| 결정 | 채택 방식 | 대안 | 이유 |
|------|-----------|------|------|
| 동기화 방식 | Application-level (orders.ts에서 supabase 직접 upsert) | DB trigger | Supabase trigger는 디버깅 어렵고 TS 타입 체인 끊김 |
| 기존 테이블 유지 | nav에서만 제거, 파일 유지 | 삭제 | 기존 데이터 보존 + 롤백 가능 |
| income/expense 신규 테이블 | fin_income_records + fin_expense_records | 기존 fin_kr/ru_transactions 확장 | 새 스키마(sale/purchase 이중통화, order FK, product_type)가 기존과 호환 불가 |
| 환율 계산 방향 | rub+krw → rate 역방향 추가 (기존 rub+rate→krw 유지) | rate만 입력 | 실제 환전 영수증의 rub+krw를 그대로 입력하는 UX 선호 |
| source='order' 행 처리 | 삭제 불가 + 주문목록 안내 링크 | 삭제 허용 | 주문↔수입 1:1 매핑 일관성 보장 |
| 대시보드 뷰 단위 | 연도 단위 (`?year=YYYY`) | 월 단위 유지 | "각 년의 월별 내용을 쉽게 볼 수 있게" 명시 요구사항 |
| amount_krw 저장 | 서버에서 계산 후 저장 | 조회 시 계산 | 집계 쿼리 단순화, 환율 변경 시 히스토리 보존 |
| 지출 배송비 auto-sync | partial unique index + upsert | 항상 insert | 중복 방지 + order당 1개 레코드 보장 |
