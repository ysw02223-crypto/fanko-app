# 주문 진행상태 표기 누락 수정

> **문제**: 주문목록 그리드의 "진행" 칸이 "—"로 표시되는 행이 다수 존재.  
> DB에는 진행상태가 저장되어 있지만 화면에 표기되지 않음.

---

## 원인 요약

DB에는 두 테이블 모두 `progress` 컬럼이 있다.

| 테이블 | 컬럼 | 현재 데이터 상태 |
|---|---|---|
| `orders` | `progress` | 값 있음 (NOT NULL, 주문 생성 시 "PAY" 고정) |
| `order_items` | `progress` | **null** (주문 생성 시 INSERT에서 누락) |

**실제 DB 분포**:
- `order_items.progress = null`이고 `orders.progress`에 값 있음: **140행**
- `order_items.progress`에 값 있음: 52행

세 가지 코드 결함이 원인이다:

1. **`toGridRow`** — `order_items.progress`만 읽고 `orders.progress`는 무시  
   → null이면 그대로 null로 표시됨

2. **`createOrderWithItemsAction`** — `order_items` INSERT 페이로드에 `progress` 필드 없음  
   → 신규 주문 생성 시 `order_items.progress`가 항상 null로 저장됨

3. **`insertDraftOrderAction`** — 동일하게 `order_items` INSERT에 `progress` 누락  
   → 그리드 inline 신규 주문도 동일 문제 발생

---

## 1. 접근방식

### Phase 1 — 표시 즉시 복구 (toGridRow 폴백)

`order_items.progress`가 null이면 `orders.progress`로 폴백.  
기존 140개 null 행을 DB 수정 없이 즉시 화면에 표시.

### Phase 2 — 신규 주문 재발 방지 (INSERT에 progress 추가)

앞으로 생성되는 주문은 `order_items.progress`에 처음부터 `"PAY"`를 저장.  
폼으로 생성(`createOrderWithItemsAction`)과 인라인 생성(`insertDraftOrderAction`) 모두 수정.

### Phase 3 — 편집 시 양쪽 동기화 (saveFieldChange 수정)

그리드에서 진행상태를 변경할 때 `order_items.progress`와 `orders.progress` 모두 업데이트.  
두 값이 영구적으로 일치하도록 유지.

### Phase 4 — 기존 데이터 일괄 수정 (DB 마이그레이션)

현재 `order_items.progress = null`인 행을 `orders.progress` 값으로 일괄 채움.  
Phase 1의 폴백에 의존하지 않고 데이터 자체를 정리.

---

## 2. 코드 스니펫

### Phase 1 — `lib/orders-ag-grid-types.ts`

```ts
// 변경 전 (line 64)
item_progress: item?.progress ?? null,

// 변경 후
item_progress: item?.progress ?? order.progress,
```

`order.progress`는 `OrderProgress` 타입으로 NOT NULL이므로 타입 변경 없음.

---

### Phase 2-A — `lib/actions/orders.ts` — `createOrderWithItemsAction`

```ts
// 변경 전: rows 배열 타입 (line 93)
const rows: Array<{
  order_num: string;
  product_type: ProductCategory | null;
  product_name: string;
  product_option: string | null;
  product_set_type: SetType;
  quantity: number;
  price_rub: number;
  prepayment_rub: number;
  extra_payment_rub: number;
  krw: null;
}> = [];

// 변경 후: progress 추가
const rows: Array<{
  order_num: string;
  product_type: ProductCategory | null;
  product_name: string;
  product_option: string | null;
  product_set_type: SetType;
  quantity: number;
  price_rub: number;
  prepayment_rub: number;
  extra_payment_rub: number;
  krw: null;
  progress: OrderProgress;   // ← 추가
}> = [];
```

```ts
// rows.push() 내부 (line 134) — progress 필드 추가
rows.push({
  order_num,
  product_type,
  product_name,
  product_option: product_option || null,
  product_set_type,
  quantity,
  price_rub,
  prepayment_rub,
  extra_payment_rub,
  krw: null,
  progress: "PAY",   // ← 추가
});
```

---

### Phase 2-B — `lib/actions/orders.ts` — `insertDraftOrderAction`

```ts
// order_items INSERT (line 358) — progress 필드 추가
const { data: itemData, error: itemErr } = await supabase
  .from("order_items")
  .insert({
    order_num,
    product_type:      null,
    product_name,
    product_option:    product_option || null,
    product_set_type,
    quantity,
    price_rub,
    prepayment_rub,
    extra_payment_rub: price_rub - prepayment_rub,
    krw:               null,
    progress:          "PAY" as OrderProgress,   // ← 추가
  })
  .select("id")
  .single();
```

---

### Phase 3 — `components/orders-ag-grid-table.tsx` — `saveFieldChange`

`item_progress` 변경 시 `orders` 테이블도 동시에 업데이트하는 분기 추가.

```ts
// 기존 item update 블록 (line 547 이후) 내부에 추가
} else if (row.item_id) {
  const dbCol = ITEM_DB_COL[field] ?? (field as string);
  const basePayload: Record<string, string | number | null> = {
    [dbCol]: newVal || null,
  };
  // ... 기존 price_rub / prepayment_rub 처리 ...

  const { error } = await supabase
    .from("order_items")
    .update(basePayload)
    .eq("id", row.item_id)
    .eq("order_num", row.order_num);
  if (error) throw new Error(error.message);

  // ← 추가: item_progress 변경 시 orders.progress도 동기화
  if (field === "item_progress" && newVal) {
    await supabase
      .from("orders")
      .update({ progress: newVal as OrderProgress })
      .eq("order_num", row.order_num);
  }

  setAllRows((prev) =>
    prev.map((r) => { ... })   // 기존 로직 유지
  );
}
```

`saveFieldChange`의 import에 `OrderProgress` 타입은 이미 있으므로 추가 불필요.

---

### Phase 4 — DB 마이그레이션 SQL

```sql
UPDATE order_items oi
SET progress = o.progress
FROM orders o
WHERE oi.order_num = o.order_num
  AND oi.progress IS NULL;
```

Supabase MCP `execute_sql`로 실행. 영향 행 수: 약 140개.

---

## 3. 파일 경로

| 파일 | Phase | 변경 내용 |
|---|---|---|
| `lib/orders-ag-grid-types.ts` | 1 | `toGridRow` — `item_progress` 폴백 수정 |
| `lib/actions/orders.ts` | 2 | `createOrderWithItemsAction` rows 타입 + push에 `progress` 추가 |
| `lib/actions/orders.ts` | 2 | `insertDraftOrderAction` order_items INSERT에 `progress` 추가 |
| `components/orders-ag-grid-table.tsx` | 3 | `saveFieldChange` — `item_progress` 변경 시 `orders.progress` 동기화 |
| DB (Supabase SQL) | 4 | 기존 null 행 일괄 backfill |

신규/삭제 파일 없음.

---

## 4. 트레이드오프 상세설명

### 4-1. Phase 1 단독 vs Phase 1+2+3+4 전체

| | Phase 1만 | 전체 (1+2+3+4) |
|---|---|---|
| 기존 데이터 표시 | 즉시 복구 (폴백) | 복구 (데이터 자체 수정) |
| 신규 주문 재발 | 재발함 (INSERT 미수정) | 방지됨 |
| 편집 후 일관성 | `orders.progress` 계속 outdated | 항상 일치 |
| 구현 복잡도 | 매우 낮음 | 낮음 |
| 위험도 | 없음 | DB 마이그레이션 포함 |

Phase 1만 적용하면 당장 화면은 복구되지만 데이터가 계속 불일치 상태로 남는다.  
전체 적용이 권장.

### 4-2. `orders.progress` vs `order_items.progress` 분리 문제

두 테이블의 `progress`는 원래 역할이 다르다:
- `orders.progress`: 주문 전체의 대표 진행상태 (1개 값)
- `order_items.progress`: 각 상품 라인별 진행상태 (상품이 여러 개면 다를 수 있음)

현재 실사용에서는 주문당 상품이 1개인 경우가 대부분이므로 두 값이 일치해도 문제없다.  
Phase 3에서 `item_progress` 변경 시 `orders.progress`도 함께 업데이트하면 충분히 일관성 유지 가능.  
만약 향후 상품이 여러 개인 주문에서 아이템별로 다른 진행상태를 쓰게 된다면  
`orders.progress` 동기화 로직을 별도로 설계해야 한다.

### 4-3. DB 마이그레이션 안전성

실행할 SQL:
```sql
UPDATE order_items oi SET progress = o.progress
FROM orders o
WHERE oi.order_num = o.order_num AND oi.progress IS NULL;
```

- `oi.progress IS NULL` 조건으로 이미 값이 있는 행은 건드리지 않음 → 안전
- `orders.progress`는 NOT NULL이므로 null로 덮어쓸 위험 없음
- 트랜잭션 단위로 실행되므로 중간 실패 시 롤백됨

---

## 5. 구현 순서

```
Phase 1 — lib/orders-ag-grid-types.ts
  [x] toGridRow: item_progress 폴백 수정 (1줄)
  [x] typecheck 통과

Phase 2 — lib/actions/orders.ts
  [x] createOrderWithItemsAction: rows 타입에 progress 추가
  [x] createOrderWithItemsAction: rows.push()에 progress: "PAY" 추가
  [x] insertDraftOrderAction: order_items INSERT에 progress: "PAY" 추가
  [x] typecheck 통과

Phase 3 — components/orders-ag-grid-table.tsx
  [x] saveFieldChange: item_progress 변경 시 orders.progress 동기화
  [x] typecheck 통과

Phase 4 — DB 마이그레이션
  [x] Supabase execute_sql로 NULL 행 backfill (140행 → 0 NULL)
  [x] 영향 행 수 확인 (192개 전체 값 있음 확인)
```
