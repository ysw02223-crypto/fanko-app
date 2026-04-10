# 재무관리 시스템 구축 계획

구현 현황: **완료** (TypeScript clean, build pending)

---

## 엑셀 3종 정밀 분석 결과

### 비즈니스 모델 전체 구조

```
┌─────────────────────────────────────────────────────────────────┐
│                     FANKO 사업 흐름                              │
│                                                                   │
│  [한국 구매]          [환전 연결]          [러시아 판매]          │
│  올리브영/공식몰  ←→  대리수취인  ←→  Avito/VK/TELEGRAM         │
│  네이버/도매         원화 ↔ 루블          도매상 등               │
│       ↓                                       ↓                  │
│  Korea.xlsx                              Russia.xlsx              │
│  (원화 수입/지출)                        (루블 매출/지출)         │
│       ↓                    ↓                  ↓                  │
│       └──────────── total.xlsx ───────────────┘                  │
│                    (통합 정산/계좌)                               │
└─────────────────────────────────────────────────────────────────┘
```

### 핵심 메커니즘: 환전 구조

```
러시아 고객
  → 루블 지불 (Avito/VK/TELEGRAM)
  → 러시아 계좌(SBER/TINKOFF) 적립
                ↓
  대리수취인 (한국인: 이목원, 진실, 큰삼촌 등)
  → 한국에서 원화 지급
                ↓
Korea.xlsx 수입: "수출대금 | 이목원 [13.56] | 1,000,000원"
  (1,000,000 ÷ 13.56 = 73,746루블 소비)
Russia.xlsx 지출: "대금결제 | 대리수취 | 이목원 [13.56] | 73,755루블"
```

**장부환율 vs 환전환율** (total.xlsx 기반):
- 장부환율: 월 기준 가상 환율 (예: 15.01)
- 환전환율: 실제 대리수취인과 적용한 환율 (예: 15.63)
- 환차익 = (환전환율 - 장부환율) × 루블 금액

---

## 파일별 정밀 분석

### Korea.xlsx — 한국 원화 장부

**시트 구성**: 항목, 양식, 1월~12월, 26년 1월~4월, 큰삼촌

**수입 컬럼**: 날짜 | 분류 | 내역 | 금액(KRW)

| 분류 | 내역 패턴 | 예시 |
|------|---------|------|
| 수출대금 | `대리인명 [환율]` | 이목원 [13.56] → 1,000,000원 |
| 기타수익 | 상품권 할인이익, 재판매, 환불 등 | 올리브영 상품권 구매 → 1,630,000원 |

> **올리브영 상품권 수익 구조**: 수입에 액면가 기록 + 지출에 실지불금액 기록 → 차액이 이익
> 예: 상품권 130만원어치 구매 → 수입 1,630,000원 기록 / 지출 1,472,500원 기록 → 이익 157,500원

**지출 컬럼**: 날짜 | 대분류 | 중분류 | 소분류 | 내역 | 금액 | 결제수단 | 판매가격 | 참고사항

| 대분류 | 중분류 | 소분류 (전수) |
|--------|--------|-------------|
| 판매 | 화장품 | 올리브영, 공식몰, 네이버, 도매, 팝업, 번개장터, 쿠팡, 기타 |
| 판매 | 앨범 | 기타, 공식몰, 네이버, 번개장터 |
| 판매 | 명품 | 후르츠, 번개장터, 공식몰, 기타 |
| 판매 | 전자기기 | 공식몰 |
| 판매 | 기타제품 | — |
| 운영비 | 서비스비용 | 국내택배, 포장재비, 증정용품비, 홍보물제작, 기타비용 |
| 운영비 | 정기결제 | Canva, GPT, 네이버, 통신비, 쿠팡 |
| 운영비 | 과실비용 | 배송오류, 상품손상, 피해보상, 기타비용 |
| 운영비 | 유형자산 | 전자기기, 설비, 사무기기 |
| 상품권 | 올리브영 | — |
| 개인운용 | 선물 | — |
| 개인운용 | 대출 | — |

**결제수단**: 현금, 올리브영(상품권), 문화상품권

> **판매가격 컬럼**: 해당 상품의 러시아 판매가(원화 환산값) → 마진 = 판매가 - 매입가 자동 계산 가능

**큰삼촌 시트**:
- 큰삼촌이 대규모 루블 환전해주는 별도 계좌 ("큰삼촌 40만 루블 환전 [17.2]" → 400,000루블)
- 지출: 러시아 현지 세금/운영비 (잔나숙모 출금, 주원이 출금 등)
- **이 시트는 Korea.xlsx의 특수 계좌이므로 수입에 기타수익으로, 지출에 운영비/세금으로 통합**

---

### Russia.xlsx — 러시아 루블 장부

**시트 구성**: 항목, 양식, 1월~12월, 26년 1월~4월

**매출 컬럼**: 날짜 | 대분류 | 소분류(채널) | 내역(상품명) | 금액[루블] | 적용환율 | 금액[원화] | 참고사항

| 대분류 | 채널(소분류) 전수 |
|--------|----------------|
| 화장품 | Avito, VK, TELEGRAM, 도매상, 기타 |
| 명품 | Avito, VK, TELEGRAM, 도매상 |
| 앨범 | Avito |
| 전자기기 | Avito |
| 선주문 | Avito |
| 기타제품 | Avito, TELEGRAM, VK |
| 배송비 | 쉽코르, 국내기타, 국제기타, 우체국 ← 고객 부담 배송비 수입 |
| 대출 | 루블대출 ← 루블 대출 수입 |

**지출 컬럼**: 날짜 | 대분류 | 중분류 | 내역 | 금액[루블]

| 대분류 | 중분류 (전수) |
|--------|-------------|
| 인건비 | 월급(다샤), 상여금(화장품 상여/치료비/생일), 외주 |
| 수수료 | Avito(클릭 수수료), 기타 |
| 배송비 | 쉽코르(러시아 국내), 국제기타(MAXCARGO/EMS/우체국) |
| 대금결제 | 대리수취(`대리인명 [환율]`), 기타 ← Korea 수출대금과 연결 |
| 포장비 | 박스, 에어캡 |
| 광고비 | Telegram |
| 개인운용 | 대출상환, 선물 |
| 과실비 | 피해보상 |

**월별 요약 지표**: 총합(순이익루블), 원화매출(총 루블×환율 원화환산), 현매출(루블 현금 기준)

---

### total.xlsx — 통합 정산

**시트 구성**: 1월 정산~12월 정산, 26년 1월~2월 정산

> ※ 원래 계좌현황 시트 존재했으나 현재 파일에서 삭제된 상태

**정산 시트 수입 구조**:
- `기타수익`: Korea 기타수익 집계 (상품권 이익, 재판매 등)
- `수출대금`: Russia 월 루블 매출 총계 × 장부환율 (ex: "1,187,061p [15.81]")
- `환차익`: (환전환율 - 장부환율) × 루블 총량
- `매출 수익`: 러시아 판매가 - 한국 매입가 합계
- `영업이익`: 수출대금 + 기타수익 - 국내운영비 - 국외운영비
- `실질 자산 증가`: 영업이익 - 개인운용 지출

**정산 시트 지출 구조**:
- `운영비 / 국내운영비`: Korea 지출 중 운영비+상품권 합계
- `운영비 / 국외운영비 [환율]p`: Russia 지출(루블) × 환율 원화 환산
- `판매 / 화장품`: Korea 판매/화장품 지출 합계
- `판매 / 앨범/명품/전자기기/기타제품`: 각 카테고리 합계
- `개인운용 / 대출`: 개인운용 지출
- `운영비 / 유형자산 / 사무기기`: 유형자산 구매

**계좌현황** (원래 시트, 재건 대상):
- 한국: 토스뱅크(회사), 국민은행, 올리브영상품권, 문화상품권
- 러시아: 루블 (1루블=14원 기준 원화 환산)
- 수익현황: 사업, 통역, 기타
- 대출현황, 저축누적액

---

## 1. 접근방식

### 메뉴 구조

```
[재무관리]
  ├── 재무 대시보드   /finance           ← 월별 KPI + 계좌 잔액 요약
  ├── 한국 내역      /finance/korea      ← 원화 수입/지출 CRUD
  ├── 러시아 내역    /finance/russia     ← 루블 매출/지출 CRUD
  ├── 환전 관리      /finance/exchange   ← 환전 이력 + 환차익
  └── 계좌 현황      /finance/accounts   ← 7개 계좌 월별 잔액
```

### 아키텍처 결정

| 결정 | 선택 | 이유 |
|------|------|------|
| 기존 DB 연결 | 연결 안 함 | orders는 배송 추적, finance는 자금 흐름 — 다른 목적 |
| 통화 분리 | fin_kr / fin_ru 테이블 분리 | 원화와 루블 혼용 방지, 집계 단순화 |
| 환전 별도 테이블 | fin_exchange_records | Korea 수입 ↔ Russia 지출 연결 + 환차익 추적 |
| Server Component | 각 page.tsx 서버 컴포넌트 | 데이터 fetch → Client Component에 props |
| 폼 방식 | 모달 폼 (인라인 편집 아님) | 항목 수(9개 필드)가 많아 인라인 편집 불편 |

---

## 2. 코드 스니펫

### DB Migration

```sql
-- 한국 원화 수입/지출
CREATE TABLE fin_kr_transactions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date           DATE        NOT NULL,
  type           TEXT        NOT NULL CHECK (type IN ('income', 'expense')),
  -- 수입 분류: 수출대금 | 기타수익
  -- 지출 대분류: 판매 | 운영비 | 상품권 | 개인운용
  category       TEXT        NOT NULL,
  -- 지출 중분류: 화장품 | 앨범 | 명품 | 전자기기 | 기타제품
  --             서비스비용 | 정기결제 | 과실비용 | 유형자산
  --             올리브영 (상품권)
  --             선물 | 대출 (개인운용)
  subcategory    TEXT,
  -- 지출 소분류: 올리브영 | 공식몰 | 네이버 | Canva | GPT 등
  detail         TEXT,
  description    TEXT        NOT NULL,  -- 내역
  amount         INTEGER     NOT NULL,  -- 원화 금액
  payment_method TEXT,                  -- 현금 | 올리브영 | 문화상품권
  selling_price  INTEGER,              -- 판매가격(러시아 판매가 원화환산)
  note           TEXT,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

-- 러시아 루블 매출/지출
CREATE TABLE fin_ru_transactions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date           DATE        NOT NULL,
  type           TEXT        NOT NULL CHECK (type IN ('income', 'expense')),
  -- 매출 대분류: 화장품 | 명품 | 앨범 | 전자기기 | 선주문 | 기타제품 | 배송비 | 대출
  -- 지출 대분류: 인건비 | 수수료 | 배송비 | 대금결제 | 포장비 | 광고비 | 개인운용 | 과실비
  category       TEXT        NOT NULL,
  -- 매출: Avito | VK | TELEGRAM | 도매상 | 기타
  -- 지출: 월급 | 상여금 | 외주 | Avito | 쉽코르 | 국제기타 | 대리수취 | 박스 | 에어캡 등
  subcategory    TEXT,
  description    TEXT        NOT NULL,  -- 내역 (상품명 또는 내용)
  amount_rub     NUMERIC     NOT NULL,  -- 루블 금액
  exchange_rate  NUMERIC,              -- 적용환율 (매출은 필수, 지출은 옵션)
  amount_krw     NUMERIC,              -- 원화 = amount_rub × exchange_rate
  note           TEXT,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

-- 환전 이력
-- Korea 수출대금 수입 ↔ Russia 대금결제/대리수취 지출의 공통 기록
CREATE TABLE fin_exchange_records (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date           DATE        NOT NULL,
  person         TEXT        NOT NULL,  -- 대리인 이름
  rub_amount     NUMERIC     NOT NULL,  -- 루블 금액
  exchange_rate  NUMERIC     NOT NULL,  -- 실제 적용 환율
  krw_amount     NUMERIC     NOT NULL,  -- 원화 = rub × rate
  book_rate      NUMERIC,              -- 장부환율 (total.xlsx 기준)
  fx_profit      NUMERIC,              -- 환차익 = (rate - book_rate) × rub
  note           TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- 계좌 잔액 월별 스냅샷
CREATE TABLE fin_account_snapshots (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year_month     TEXT        NOT NULL,  -- 'YYYY-MM'
  -- toss | kookmin | olive_coupon | culture_coupon | sber | tinkoff | receivable
  account        TEXT        NOT NULL,
  balance        NUMERIC     NOT NULL,
  currency       TEXT        NOT NULL DEFAULT 'KRW',  -- KRW | RUB
  created_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE(year_month, account)
);
```

### lib/schema.ts — Finance 타입 추가

```typescript
export type FinKrTransaction = {
  id: string;
  date: string;
  type: "income" | "expense";
  category: string;
  subcategory: string | null;
  detail: string | null;
  description: string;
  amount: number;
  payment_method: string | null;
  selling_price: number | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type FinRuTransaction = {
  id: string;
  date: string;
  type: "income" | "expense";
  category: string;
  subcategory: string | null;
  description: string;
  amount_rub: number;
  exchange_rate: number | null;
  amount_krw: number | null;
  note: string | null;
  created_at: string;
  updated_at: string;
};

export type FinExchangeRecord = {
  id: string;
  date: string;
  person: string;
  rub_amount: number;
  exchange_rate: number;
  krw_amount: number;
  book_rate: number | null;
  fx_profit: number | null;
  note: string | null;
  created_at: string;
};

export type FinAccountSnapshot = {
  id: string;
  year_month: string;
  account: "toss" | "kookmin" | "olive_coupon" | "culture_coupon" | "sber" | "tinkoff" | "receivable";
  balance: number;
  currency: "KRW" | "RUB";
  created_at: string;
};
```

### lib/actions/finance.ts — Server Actions

```typescript
"use server";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { FinKrTransaction, FinRuTransaction, FinExchangeRecord, FinAccountSnapshot } from "@/lib/schema";

// ─── 한국 내역 ─────────────────────────────────────
export async function getKrTransactions(yearMonth: string): Promise<FinKrTransaction[]>
// SELECT * WHERE date BETWEEN 월초~월말 ORDER BY date DESC

export async function upsertKrTransaction(
  payload: Omit<FinKrTransaction, "id" | "created_at" | "updated_at">,
  id?: string
): Promise<{ error?: string }>

export async function deleteKrTransaction(id: string): Promise<{ error?: string }>

// ─── 러시아 내역 ────────────────────────────────────
export async function getRuTransactions(yearMonth: string): Promise<FinRuTransaction[]>

export async function upsertRuTransaction(
  payload: Omit<FinRuTransaction, "id" | "created_at" | "updated_at">,
  id?: string
): Promise<{ error?: string }>

export async function deleteRuTransaction(id: string): Promise<{ error?: string }>

// ─── 환전 이력 ──────────────────────────────────────
export async function getExchangeRecords(yearMonth?: string): Promise<FinExchangeRecord[]>
// yearMonth 없으면 전체, 있으면 해당 월만

export async function upsertExchangeRecord(
  payload: Omit<FinExchangeRecord, "id" | "created_at">,
  id?: string
): Promise<{ error?: string }>

export async function deleteExchangeRecord(id: string): Promise<{ error?: string }>

// ─── 계좌 현황 ──────────────────────────────────────
export async function getAccountSnapshots(yearMonth: string): Promise<FinAccountSnapshot[]>

export async function upsertAccountSnapshot(
  payload: Omit<FinAccountSnapshot, "id" | "created_at">
): Promise<{ error?: string }>
// UPSERT by (year_month, account) UNIQUE

// ─── 대시보드 집계 ──────────────────────────────────
export type FinMonthlySummary = {
  year_month: string;       // 'YYYY-MM'
  kr_income: number;        // 한국 수입 합계
  kr_expense: number;       // 한국 지출 합계
  ru_income_rub: number;    // 러시아 매출 루블 합계
  ru_income_krw: number;    // 러시아 매출 원화 환산 합계
  ru_expense_rub: number;   // 러시아 지출 루블 합계
  exchange_krw: number;     // 환전 원화 합계
  fx_profit: number;        // 환차익 합계
};

export async function getFinanceSummaries(months: number): Promise<FinMonthlySummary[]>
// 최근 N개월 집계 (GROUP BY year_month)
```

### nav-menu.tsx — 재무관리 활성화

```typescript
// disabled: true 제거 + items 추가
{
  label: "재무관리",
  items: [
    { label: "재무 대시보드", href: "/finance" },
    { label: "한국 내역",    href: "/finance/korea" },
    { label: "러시아 내역",  href: "/finance/russia" },
    { label: "환전 관리",    href: "/finance/exchange" },
    { label: "계좌 현황",    href: "/finance/accounts" },
  ],
},
```

### 공통 카테고리 상수 — lib/finance-categories.ts

```typescript
// 한국 지출 카테고리 계층 (드롭다운용)
export const KR_EXPENSE_CATEGORIES = {
  판매: {
    화장품: ["올리브영", "공식몰", "네이버", "도매", "팝업", "번개장터", "쿠팡", "기타"],
    앨범:   ["공식몰", "네이버", "번개장터", "기타"],
    명품:   ["후르츠", "번개장터", "공식몰", "기타"],
    전자기기: ["공식몰"],
    기타제품: [],
  },
  운영비: {
    서비스비용: ["국내택배", "포장재비", "증정용품비", "홍보물제작", "기타비용"],
    정기결제:   ["Canva", "GPT", "네이버", "통신비", "쿠팡"],
    과실비용:   ["배송오류", "상품손상", "피해보상", "기타비용"],
    유형자산:   ["전자기기", "설비", "사무기기"],
  },
  상품권: { 올리브영: [] },
  개인운용: { 선물: [], 대출: [] },
} as const;

// 한국 수입 카테고리
export const KR_INCOME_CATEGORIES = ["수출대금", "기타수익"] as const;

// 러시아 매출 카테고리
export const RU_INCOME_CATEGORIES = {
  화장품:   ["Avito", "VK", "TELEGRAM", "도매상", "기타"],
  명품:     ["Avito", "VK", "TELEGRAM", "도매상"],
  앨범:     ["Avito"],
  전자기기: ["Avito"],
  선주문:   ["Avito"],
  기타제품: ["Avito", "TELEGRAM", "VK"],
  배송비:   ["쉽코르", "국내기타", "국제기타", "우체국"],
  대출:     ["루블대출"],
} as const;

// 러시아 지출 카테고리
export const RU_EXPENSE_CATEGORIES = {
  인건비:   ["월급", "상여금", "외주"],
  수수료:   ["Avito", "기타"],
  배송비:   ["쉽코르", "국제기타"],
  대금결제: ["대리수취", "기타"],
  포장비:   ["박스", "에어캡"],
  광고비:   ["Telegram"],
  개인운용: ["대출상환", "선물"],
  과실비:   ["피해보상"],
} as const;

// 결제수단
export const KR_PAYMENT_METHODS = ["현금", "올리브영", "문화상품권"] as const;

// 계좌명 (한국)
export const KR_ACCOUNTS = ["toss", "kookmin", "olive_coupon", "culture_coupon"] as const;
// 계좌명 (러시아)
export const RU_ACCOUNTS = ["sber", "tinkoff", "receivable"] as const;
export const ACCOUNT_LABELS: Record<string, string> = {
  toss: "토스뱅크",
  kookmin: "국민은행",
  olive_coupon: "올리브영 상품권",
  culture_coupon: "문화상품권",
  sber: "SBER",
  tinkoff: "TINKOFF",
  receivable: "미수금",
};
```

### 컴포넌트 설계

**`components/fin-kr-table.tsx`** (한국 내역)
```
상단: [년도-월 선택] [+ 수입 추가] [+ 지출 추가]
탭:   [전체] [수입 N건] [지출 N건]
테이블 (지출):
  날짜 | 대분류 | 중분류 | 소분류 | 내역 | 금액 | 결제수단 | 판매가격 | 메모 | 삭제
테이블 (수입):
  날짜 | 분류 | 내역 | 금액 | —
하단 집계:
  수입 합계: X원 / 지출 합계: X원 / 잔액: X원
```

**`components/fin-ru-table.tsx`** (러시아 내역)
```
상단: [월 선택] [+ 매출 추가] [+ 지출 추가]
탭:   [전체] [매출 N건] [지출 N건]
테이블 (매출):
  날짜 | 대분류 | 채널 | 상품명 | 루블금액 | 환율 | 원화금액 | 메모 | 삭제
테이블 (지출):
  날짜 | 대분류 | 중분류 | 내역 | 루블금액 | 삭제
하단:
  매출: X루블 (≈X원) / 지출: X루블 / 순이익: X루블
```

**`components/fin-exchange-table.tsx`** (환전 관리)
```
요약 카드 (4개):
  이번 달 환전(루블) / 이번 달 환전(원화) / 평균 환율 / 누적 환차익
테이블:
  날짜 | 대리인 | 루블 | 적용환율 | 원화 | 장부환율 | 환차익 | 메모 | 삭제
[+ 환전 추가] 버튼 → 폼
```

**`components/fin-accounts-table.tsx`** (계좌 현황)
```
테이블 (계좌 × 월별):
  계좌명   | 통화 | 이전달 | 이번달 | (편집 버튼)
  토스뱅크 | KRW  | X원   | [입력]  | 저장
  ...
  SBER     | RUB  | X루블  | [입력]  | 저장
```

**`components/fin-dashboard.tsx`** (대시보드)
```
KPI 카드 (4개):
  원화 수입 | 원화 지출 | 루블 매출(원화환산) | 순이익
월별 추이 (최근 12개월 Bar):
  [수입■] [지출■] 월별 나란히 표시 (순수 Tailwind div, 라이브러리 불필요)
계좌 잔액 요약:
  토스뱅크 X원 / 국민 X원 / 올리브영쿠폰 X원 / ...
  SBER X루블(≈X원) / ...
```

---

## 3. 파일경로

### 신규 생성

| 파일 | 설명 |
|------|------|
| `app/finance/layout.tsx` | 재무관리 공통 레이아웃 (인증) |
| `app/finance/page.tsx` | 대시보드 서버 컴포넌트 |
| `app/finance/korea/page.tsx` | 한국 내역 페이지 |
| `app/finance/russia/page.tsx` | 러시아 내역 페이지 |
| `app/finance/exchange/page.tsx` | 환전 관리 페이지 |
| `app/finance/accounts/page.tsx` | 계좌 현황 페이지 |
| `lib/actions/finance.ts` | 재무 Server Actions |
| `lib/finance-categories.ts` | 카테고리 상수 |
| `components/fin-dashboard.tsx` | 대시보드 클라이언트 컴포넌트 |
| `components/fin-kr-table.tsx` | 한국 수입/지출 테이블 |
| `components/fin-ru-table.tsx` | 러시아 루블 테이블 |
| `components/fin-exchange-table.tsx` | 환전 이력 테이블 |
| `components/fin-accounts-table.tsx` | 계좌 현황 테이블 |
| `components/fin-transaction-modal.tsx` | 수입/지출 입력 모달 폼 |
| `components/fin-month-select.tsx` | 년월 선택 공통 컴포넌트 |

### 수정

| 파일 | 변경 내용 |
|------|---------|
| `components/nav-menu.tsx` | 재무관리 disabled 해제 + 5개 서브메뉴 |
| `lib/schema.ts` | Finance 타입 4개 추가 |

### Supabase Migration

```sql
-- 마이그레이션 이름: create_finance_tables
-- 4개 테이블: fin_kr_transactions, fin_ru_transactions,
--             fin_exchange_records, fin_account_snapshots
```

---

## 4. 트레이드오프

### ✅ 이 설계의 장점

**Korea/Russia 이원 통화 구조 완전 반영**
- 한국(원화)과 러시아(루블)를 물리적으로 다른 테이블에 저장
- 루블 금액 + 환율 + 원화 금액을 행마다 개별 보관 → 환율 변동 이력 보존
- 나중에 환율 수정 시 원화 금액 재계산 가능

**total.xlsx 정산 로직 재현 가능**
- 영업이익 = 수출대금(fin_exchange_records 집계) - 운영비(fin_kr_transactions 집계)
- 환차익 = fin_exchange_records에서 자동 계산
- 판매 마진 = selling_price - amount 자동 계산 (fin_kr_transactions 판매 카테고리)

**올리브영 상품권 이익 자동 추적**
- 수입에 액면가, 지출에 실지불금액 기록 → 순이익에서 자동으로 이익 반영
- 별도 계산 불필요

**카테고리 계층 구조 유지**
- lib/finance-categories.ts에 실제 엑셀 기반 카테고리 상수 → 드롭다운 연동
- 대분류 선택 시 중분류 필터링, 중분류 선택 시 소분류 필터링
- 새 카테고리 추가 시 상수 파일만 수정

### ⚠️ 한계 및 주의사항

**수출대금 ↔ 대리수취 자동 연결 없음**
- Korea.xlsx 수출대금과 Russia.xlsx 대금결제/대리수취는 사람이름으로만 연결 가능
- Phase 1에서는 각자 독립 입력, fin_exchange_records만이 두 쪽의 공통 기록
- 완전한 연결을 원하면 나중에 `exchange_id` FK 추가 가능

**total.xlsx 자동 생성 없음**
- total.xlsx처럼 매월 통합 정산 자동 계산은 별도 집계 쿼리 구현 필요
- /finance 대시보드에서 기본 KPI는 제공하나, total.xlsx의 모든 항목 재현은 Phase 2

**계좌 잔액은 수동 스냅샷**
- "전월 잔액 + 입출금 = 당월 잔액" 자동 계산 없음
- 매월 직접 입력 (엑셀처럼 수동 확인 후 기록)
- Phase 2에서 fin_kr/ru_transactions 집계로 자동 계산 추가 가능

**큰삼촌 시트 별도 처리**
- 큰삼촌 관련 환전 수입 → fin_kr_transactions의 기타수익으로 입력
- 큰삼촌 관련 세금 지출 → fin_kr_transactions의 운영비/세금(새 소분류 추가)으로 입력
- 큰삼촌 시트 전용 페이지는 불필요 (통합 처리)

---

## 구현 체크리스트

### Phase 1 — 기반 (DB + 타입 + 메뉴)
- [x] Supabase migration: fin_kr_transactions, fin_ru_transactions, fin_exchange_records, fin_account_snapshots 테이블 생성
- [x] `lib/schema.ts` — FinKrTransaction, FinRuTransaction, FinExchangeRecord, FinAccountSnapshot 타입 추가
- [x] `lib/finance-categories.ts` — 카테고리 상수 파일 생성
- [x] `app/finance/layout.tsx` — 인증 레이아웃
- [x] `components/nav-menu.tsx` — 재무관리 활성화 + 5개 서브메뉴

### Phase 2 — 한국 내역 CRUD
- [x] `lib/actions/finance.ts` — getKrTransactions, upsertKrTransaction, deleteKrTransaction
- [x] `components/fin-month-select.tsx` — 년월 선택 컴포넌트
- [x] `components/fin-kr-table.tsx` — 수입/지출 테이블 (모달 내장)
- [x] `app/finance/korea/page.tsx`

### Phase 3 — 환전 관리 CRUD
- [x] `lib/actions/finance.ts` — getExchangeRecords, upsertExchangeRecord, deleteExchangeRecord 추가
- [x] `components/fin-exchange-table.tsx` — 환전 이력 테이블 + 요약 카드
- [x] `app/finance/exchange/page.tsx`

### Phase 4 — 러시아 내역 CRUD
- [x] `lib/actions/finance.ts` — getRuTransactions, upsertRuTransaction, deleteRuTransaction 추가
- [x] `components/fin-ru-table.tsx` — 루블 매출/지출 테이블 (원화 자동계산)
- [x] `app/finance/russia/page.tsx`

### Phase 5 — 계좌 현황 + 대시보드
- [x] `lib/actions/finance.ts` — getAccountSnapshots, upsertAccountSnapshot, getFinanceSummaries 추가
- [x] `components/fin-accounts-table.tsx` — 계좌별 월별 잔액 테이블
- [x] `app/finance/accounts/page.tsx`
- [x] `components/fin-dashboard.tsx` — KPI 카드 + 월별 추이 바 차트 (Tailwind 순수 구현)
- [x] `app/finance/page.tsx`

### 마무리
- [x] `npx tsc --noEmit` 타입 오류 0개 확인
- [x] `npm run build` 성공
- [ ] GitHub 푸시 + Vercel 배포
