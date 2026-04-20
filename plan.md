# 주문목록 인라인 신규주문 입력

> **목표**: 주문목록 그리드 하단 `+ 행 추가` 버튼으로 빈 행을 생성하고,  
> 기존 편집과 동일하게 Enter/Tab/클릭으로 저장. 미완성 행은 빨간색 표기.

---

## 1. 접근방식

### 1-1. Draft Row 개념

```
allRows = [...실제 DB 행, ...draft 행(item_id === null)]
```

- `item_id === null` 이 유일한 "draft 행" 판별자 (기존 타입 변경 없음)
- `rowKey = "__draft_<timestamp>"` — AG Grid 키 안정성 확보
- 저장 완료 시 `fetchOrders()` 로 전체 재로드 → draft 행이 실제 행으로 교체

### 1-2. 핵심 데이터 흐름

```
[+ 버튼 클릭]
    ↓
addDraftRow() → allRows에 빈 OrderGridRow(item_id=null) 추가
    ↓
AG Grid 최하단에 연두색 빈 행 표시

[사용자 편집 → Enter/Tab/클릭]
    ↓
onCellValueChanged → handleCellValueChanged
    ↓
item_id === null?
    ├── YES → handleDraftCellChange()
    │       ├── 1. allRows 로컬 업데이트 (auto-platform, auto-option 동시 적용)
    │       ├── 2. 필수값 3개 검증 (order_num, date, product_name)
    │       │   ├── 미완성 → draftErrors에 rowKey 추가 → 빨간색 행
    │       │   └── 완성 → insertDraftOrderAction() 호출
    │       │           ├── 실패 → draftErrors 추가 + toast 에러
    │       │           └── 성공 → fetchOrders() (draft 행 유지하며 재로드)
    │
    └── NO  → 기존 saveFieldChange() (변경 없음)

[FormulaBar onSave]
    ↓
handleFormulaSave → item_id === null? → handleDraftCellChange (동일 경로)
```

### 1-3. 자동 파생 규칙

| 트리거 | 파생값 | 규칙 |
|---|---|---|
| `order_num` 변경 | `platform` | 앞 2자리: `"01"`→avito, `"02"`→telegram, `"03"`→vk |
| `product_name` 변경 | `product_option` | 마지막 `(...)` 추출: `/\(([^)]+)\)/g` |

### 1-4. DB INSERT 순서 (FK 제약)

```
① orders INSERT (order_num PK)
② order_items INSERT (order_num FK → orders)  ← 반드시 ① 이후
③ fin_income_records upsert (order_item_id FK → order_items)
④ revalidatePath("/orders"), revalidatePath("/finance/income")
⑤ return { itemId: string }  ← redirect 없음 (기존 createOrderWithItemsAction과 차이)
```

### 1-5. draft 행 격리 (정렬·필터·통계)

| 위치 | 현재 | 변경 |
|---|---|---|
| `rowData` sort | TOP_GROUP → date → order_num | draft 행은 항상 최하단 (sort 전 분리) |
| `rowData` filter | DONE/CANCEL 숨김, 필터 적용 | draft 행은 필터 무시 항상 표시 |
| `stats` | `allRows` 기준 | `allRows.filter(r => r.item_id !== null)` 기준 |
| `orderCount` | `rowData` 기준 | `rowData.filter(r => r.item_id !== null)` 기준 |
| `fetchOrders` | allRows 전체 교체 | 기존 draft 행 유지: `[...real, ...prev.filter(r => r.item_id === null)]` |
| `initialOrders` effect | allRows 전체 교체 | 동일하게 draft 행 유지 |

---

## 2. 코드 스니펫

### 2-1. `lib/actions/orders.ts` — 신규 Server Action 추가

```ts
// 기존 파일 맨 아래에 추가. redirect 없이 itemId 반환.

export type InsertDraftOrderResult = { itemId: string } | { error: string };

export async function insertDraftOrderAction(
  payload: CreateOrderWithItemsPayload,
): Promise<InsertDraftOrderResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "로그인이 필요합니다." };

  const order_num = String(payload.order_num ?? "").trim();
  if (!order_num) return { error: "주문번호를 입력하세요." };

  const platform = String(payload.platform ?? "");
  const order_type = String(payload.order_type ?? "KOREA");
  const date = String(payload.date ?? "").trim();
  if (!isPlatform(platform)) return { error: "플랫폼이 올바르지 않습니다. (주문번호 앞 2자리 확인)" };
  if (!isOrderRoute(order_type)) return { error: "주문 경로가 올바르지 않습니다." };
  if (!date) return { error: "주문일을 입력하세요." };

  const L = (payload.lines ?? [])[0];
  if (!L) return { error: "상품명을 입력하세요." };
  const product_name = String(L.product_name ?? "").trim();
  if (!product_name) return { error: "상품명을 입력하세요." };

  const product_option = String(L.product_option ?? "").trim();
  const pst = String(L.product_set_type ?? "Single");
  const product_set_type: SetType = isSetType(pst) ? pst : "Single";
  const quantity  = Math.max(1, Math.floor(Number(L.quantity) || 1));
  const price_rub = Number(L.price_rub) || 0;
  const prepayment_rub = Number(L.prepayment_rub) || 0;

  // ① orders INSERT
  const { error: orderErr } = await supabase.from("orders").insert({
    order_num,
    platform,
    order_type,
    date,
    progress: "PAY" as OrderProgress,
    customer_name: String(payload.customer_name ?? "").trim() || null,
    gift: payload.gift === "ask" ? "ask" : "no",
    photo_sent: "Not sent" as PhotoStatus,
    purchase_channel: null,
  });
  if (orderErr) return { error: orderErr.message };

  // ② order_items INSERT
  const { data: itemData, error: itemErr } = await supabase
    .from("order_items")
    .insert({
      order_num,
      product_type: null,
      product_name,
      product_option: product_option || null,
      product_set_type,
      quantity,
      price_rub,
      prepayment_rub,
      extra_payment_rub: price_rub - prepayment_rub,
      krw: null,
    })
    .select("id")
    .single();

  if (itemErr) {
    await supabase.from("orders").delete().eq("order_num", order_num);
    return { error: itemErr.message };
  }

  // ③ fin_income_records 동기화
  const saleKrw = Math.round(price_rub * 16.5);
  await supabase.from("fin_income_records").upsert(
    {
      date, category: "러시아판매", sub_category: null,
      product_name, product_type: null,
      sale_currency: "RUB", sale_amount: price_rub, sale_rate: 16.5, sale_krw: saleKrw,
      purchase_currency: "KRW", purchase_amount: 0, purchase_rate: null, purchase_krw: 0,
      profit_krw: saleKrw, source: "order",
      order_item_id: itemData.id as string, note: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "order_item_id" },
  );

  revalidatePath("/orders");
  revalidatePath("/finance/income");
  return { itemId: itemData.id as string };
}
```

### 2-2. `components/orders-ag-grid-table.tsx` — 변경 목록

#### ① import 추가

```tsx
// 기존 import에 추가
import { insertDraftOrderAction, type InsertDraftOrderResult } from "@/lib/actions/orders";
```

#### ② 모듈 상수 추가 (파일 상단, ORDER_FIELDS 근처)

```tsx
// 주문번호 앞 2자리 → 플랫폼 매핑
const PREFIX_TO_PLATFORM: Readonly<Record<string, string>> = {
  "01": "avito",
  "02": "telegram",
  "03": "vk",
};
```

#### ③ 상태 추가 (기존 useState 블록 끝에)

```tsx
// 기존: const [editingCell, ...] 자리에 이미 focusedCell 있음
// 추가:
const [draftErrors, setDraftErrors] = useState<ReadonlySet<string>>(new Set());
```

#### ④ `initialOrders` effect 수정 — draft 행 보존

```tsx
// 변경 전 (line ~405)
useEffect(() => {
  setAllRows(
    flattenOrders(initialOrders)
      .filter((r) => r.item !== null)
      .map(toGridRow),
  );
}, [initialOrders]);

// 변경 후
useEffect(() => {
  const real = flattenOrders(initialOrders)
    .filter((r) => r.item !== null)
    .map(toGridRow);
  setAllRows((prev) => {
    const drafts = prev.filter((r) => r.item_id === null);
    return [...real, ...drafts];
  });
}, [initialOrders]);
```

#### ⑤ `rowData` useMemo 수정 — draft 행 정렬/필터 격리

```tsx
const rowData = useMemo<OrderGridRow[]>(() => {
  const q = searchQuery.trim().toLowerCase();
  const hasFilter = q !== "" || Object.values(filters).some(Boolean);

  const [drafts, real] = allRows.reduce<[OrderGridRow[], OrderGridRow[]]>(
    ([d, r], row) => (row.item_id === null ? [[...d, row], r] : [d, [...r, row]]),
    [[], []],
  );

  const sorted = [...real].sort((a, b) => {
    const aP = a.item_progress ?? "";
    const bP = b.item_progress ?? "";
    const aTop = TOP_GROUP.has(aP);
    const bTop = TOP_GROUP.has(bP);
    if (aTop && !bTop) return -1;
    if (!aTop && bTop) return 1;
    const dA = new Date(a.date).getTime();
    const dB = new Date(b.date).getTime();
    if (dA !== dB) return dA - dB;
    return a.order_num.localeCompare(b.order_num);
  });

  const filtered = sorted.filter((row) => {
    if (!hasFilter) {
      const p = row.item_progress ?? "";
      if (p === "DONE" || p === "CANCEL") return false;
    }
    if (filters.platform && row.platform !== filters.platform) return false;
    const prog = row.item_progress ?? "";
    if (filters.progress && prog !== filters.progress) return false;
    if (filters.setType && row.product_set_type !== filters.setType) return false;
    const gift = row.item_gift ?? "no";
    if (filters.gift && gift !== filters.gift) return false;
    const photo = row.item_photo_sent ?? "Not sent";
    if (filters.photoSent && photo !== filters.photoSent) return false;
    const extra = row.extra_payment_rub;
    if (filters.hasBalance === "yes" && !(extra > 0)) return false;
    if (filters.hasBalance === "no" && extra > 0) return false;
    if (q) {
      const match =
        row.order_num.toLowerCase().includes(q) ||
        row.product_name.toLowerCase().includes(q) ||
        (row.customer_name ?? "").toLowerCase().includes(q) ||
        (row.product_option ?? "").toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  // draft 행은 항상 맨 아래
  return [...filtered, ...drafts];
}, [allRows, searchQuery, filters]);
```

#### ⑥ `stats` useMemo 수정 — draft 행 제외

```tsx
const stats = useMemo(() => {
  const realRows = allRows.filter((r) => r.item_id !== null); // draft 제외
  const activeOrderNums = new Set(
    realRows.filter((r) => TOP_GROUP.has(r.item_progress ?? "")).map((r) => r.order_num),
  );
  return {
    activeOrders: activeOrderNums.size,
    totalLines:   realRows.length,
    inDelivery:   realRows.filter((r) => r.item_progress === "IN DELIVERY").length,
    withBalance:  realRows.filter((r) => r.extra_payment_rub > 0).length,
  };
}, [allRows]);
```

#### ⑦ `fetchOrders` 수정 — draft 행 보존

```tsx
const fetchOrders = useCallback(async () => {
  const { data } = await supabase
    .from("orders")
    .select(`*, order_items (id, product_type, product_name, product_option, product_set_type, quantity, price_rub, prepayment_rub, extra_payment_rub, krw, progress, gift, photo_sent)`)
    .order("date", { ascending: false })
    .order("order_num", { ascending: false });
  if (data) {
    const real = flattenOrders(data as OrderWithNestedItems[])
      .filter((r) => r.item !== null)
      .map(toGridRow);
    setAllRows((prev) => {
      const drafts = prev.filter((r) => r.item_id === null);
      return [...real, ...drafts];
    });
  }
}, [supabase]);
```

#### ⑧ `getRowStyle` 수정 — draft 행 색상 추가

```tsx
// 기존 deps: []  →  변경 후 deps: [draftErrors]
const getRowStyle = useCallback(
  (params: RowClassParams<OrderGridRow>): RowStyle | undefined => {
    if (params.data?.item_id === null) {
      if (draftErrors.has(params.data.rowKey)) {
        return { backgroundColor: "#fee2e2", borderLeft: "3px solid #ef4444" };
      }
      return { backgroundColor: "#f0fdf4" }; // 연두색: 입력 대기
    }
    const idx = (params.data?.groupColorIndex ?? 0) % ROW_BG_COLORS.length;
    return { backgroundColor: ROW_BG_COLORS[idx] + "33" };
  },
  [draftErrors],
);
```

#### ⑨ `addDraftRow` 핸들러 추가 (fetchOrders 아래)

```tsx
const addDraftRow = useCallback(() => {
  const draft: OrderGridRow = {
    rowKey:           `__draft_${Date.now()}`,
    groupColorIndex:  0,
    order_num:        "",
    date:             new Date().toISOString().split("T")[0], // 오늘 날짜
    platform:         "avito",
    order_type:       "KOREA",
    customer_name:    null,
    order_gift:       "no",
    order_photo_sent: "Not sent",
    purchase_channel: null,
    item_id:          null,
    product_type:     null,
    product_name:     "",
    product_option:   null,
    product_set_type: "Single",
    quantity:         1,
    price_rub:        0,
    prepayment_rub:   0,
    extra_payment_rub: 0,
    krw:              null,
    item_progress:    "PAY",
    item_gift:        "no",
    item_photo_sent:  "Not sent",
    shipping_fee:     null,
    applied_weight:   null,
    tracking_number:  null,
  };
  setAllRows((prev) => [...prev, draft]);
  setTimeout(() => {
    const api = gridRef.current?.api;
    if (!api) return;
    api.ensureIndexVisible(api.getDisplayedRowCount() - 1, "bottom");
  }, 50);
}, []);
```

#### ⑩ `handleDraftCellChange` 핸들러 추가 (addDraftRow 아래)

```tsx
const handleDraftCellChange = useCallback(
  async (
    field: keyof OrderGridRow,
    row: OrderGridRow,
    newValue: string | number | null,
  ) => {
    // 1. 로컬 상태 업데이트 + 자동 파생
    const updated: OrderGridRow = { ...row, [field]: newValue };

    if (field === "order_num") {
      const prefix = String(newValue ?? "").substring(0, 2);
      const derived = PREFIX_TO_PLATFORM[prefix];
      if (derived) updated.platform = derived;
    }
    if (field === "product_name") {
      const matches = String(newValue ?? "").match(/\(([^)]+)\)/g);
      if (matches) {
        const last = matches[matches.length - 1];
        updated.product_option = last.slice(1, -1);
      }
    }

    setAllRows((prev) =>
      prev.map((r) => (r.rowKey === row.rowKey ? updated : r)),
    );

    // 2. 필수값 검증
    const ready =
      updated.order_num.trim() !== "" &&
      updated.date.trim() !== "" &&
      updated.product_name.trim() !== "";

    if (!ready) {
      // 일부만 입력된 경우에만 에러 표시 (완전히 빈 행은 표시 안 함)
      const touched = updated.order_num !== "" || updated.product_name !== "";
      if (touched) {
        setDraftErrors((prev) => new Set(prev).add(row.rowKey));
      }
      return;
    }

    // 3. INSERT 시도
    const result: InsertDraftOrderResult = await insertDraftOrderAction({
      order_num:     updated.order_num.trim(),
      platform:      updated.platform,
      order_type:    updated.order_type,
      date:          updated.date.trim(),
      customer_name: updated.customer_name ?? "",
      gift:          updated.order_gift,
      lines: [{
        product_type:     updated.product_type ?? "",
        product_name:     updated.product_name.trim(),
        product_option:   updated.product_option ?? "",
        product_set_type: updated.product_set_type,
        quantity:         updated.quantity || 1,
        price_rub:        updated.price_rub || 0,
        prepayment_rub:   updated.prepayment_rub || 0,
      }],
    });

    if ("error" in result) {
      setDraftErrors((prev) => new Set(prev).add(row.rowKey));
      setToastType("error");
      setToast(result.error);
      return;
    }

    // 4. 성공: draftErrors에서 제거 + 데이터 재로드
    setDraftErrors((prev) => { const s = new Set(prev); s.delete(row.rowKey); return s; });
    setToastType("success");
    setToast("주문을 저장했습니다.");
    await fetchOrders();
  },
  [fetchOrders],
);
```

#### ⑪ `handleCellValueChanged` 수정 — draft 분기 추가

```tsx
const handleCellValueChanged = useCallback(
  (event: CellValueChangedEvent<OrderGridRow>) => {
    const fieldRaw = event.colDef.field;
    if (!fieldRaw) return;
    const field = fieldRaw as keyof OrderGridRow;

    // draft 행: INSERT 경로
    if (event.data.item_id === null) {
      void handleDraftCellChange(field, event.data, event.newValue as string | number | null);
      return;
    }

    // 실제 행: 기존 UPDATE 경로
    void saveFieldChange(
      field,
      event.data,
      event.oldValue as string | number | null,
      event.newValue as string | number | null,
      () => event.node.setDataValue(field as string, event.oldValue),
    );
  },
  [saveFieldChange, handleDraftCellChange],
);
```

#### ⑫ `handleFormulaSave` 수정 — draft 분기 추가

```tsx
const handleFormulaSave = useCallback(
  (field: keyof OrderGridRow, rowData: OrderGridRow, newValue: string | number | null) => {
    if (rowData.item_id === null) {
      void handleDraftCellChange(field, rowData, newValue);
    } else {
      void saveFieldChange(field, rowData, rowData[field] as string | number | null, newValue, () => {});
    }
    setFocusedCell(null);
  },
  [saveFieldChange, handleDraftCellChange],
);
```

#### ⑬ `orderCount` 수정 — draft 제외

```tsx
// 변경 전
const orderCount = new Set(rowData.map((r) => r.order_num)).size;

// 변경 후
const orderCount = new Set(rowData.filter((r) => r.item_id !== null).map((r) => r.order_num)).size;
```

#### ⑭ JSX 수정 — + 버튼 푸터 추가

```tsx
{/* ── FormulaBar + AG Grid (flex column) ──────────────────────────── */}
<div className="flex h-full flex-col">
  {!isMobile && (
    <FormulaBar ... />
  )}
  <div className="min-h-0 flex-1" style={{ height: "100%", width: "100%" }}>
    <AgGridReact<OrderGridRow> ... />
  </div>

  {/* + 행 추가 버튼 */}
  <div className="shrink-0 border-t border-zinc-200 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900">
    <button
      type="button"
      onClick={addDraftRow}
      className="flex items-center gap-1.5 rounded-lg border border-dashed border-zinc-300 px-3 py-1.5 text-sm text-zinc-500 transition hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-600 dark:border-zinc-600 dark:text-zinc-400 dark:hover:border-emerald-500 dark:hover:bg-emerald-950/20 dark:hover:text-emerald-400"
    >
      <span className="text-base font-bold leading-none">+</span>
      행 추가
    </button>
  </div>
</div>
```

---

## 3. 파일 경로

### 수정 파일

| 파일 | 변경 내용 |
|------|-----------|
| `lib/actions/orders.ts` | `insertDraftOrderAction` 추가 (redirect 없음, itemId 반환) |
| `components/orders-ag-grid-table.tsx` | draft 행 전체 로직 추가 |

### 신규 파일

없음.

### 삭제 파일

없음.

### 유지 파일

| 파일 | 이유 |
|------|------|
| `lib/orders-ag-grid-types.ts` | `OrderGridRow` 타입 무변경 (`item_id: string \| null` 이미 존재) |
| `lib/schema.ts` | 상수 무변경 |
| `components/formula-bar.tsx` | 무변경 (draft 행도 동일하게 동작) |
| `lib/actions/order-items.ts` | 무변경 |

---

## 4. 트레이드오프 상세설명

### 4-1. INSERT 타이밍: "3개 필수 입력 즉시 저장" vs "명시적 저장 버튼"

| | **즉시 저장 (채택)** | 명시적 저장 버튼 |
|---|---|---|
| UX | 기존 편집과 동일 | 버튼 추가, 그리드와 이질감 |
| 저장 시점 | 3개 모두 입력되는 순간 | 사용자가 버튼 클릭 시 |
| 중복 입력 위험 | 같은 order_num 두 번 → DB unique 에러로 캐치 | 버튼 클릭 전 검증 가능 |
| 미완성 행 처리 | 빨간색 표시, 나중에 보완 가능 | 저장 전까지 DB에 없음 |

즉시 저장이 스프레드시트 UX와 일치하여 채택.

### 4-2. draft 행 보존 전략: fetchOrders vs 타겟 교체

| | **fetchOrders 전체 재로드 (채택)** | 타겟 행만 교체 |
|---|---|---|
| 구현 복잡도 | 낮음 (fetchOrders 이미 존재) | 높음 (UUID 매핑, 정렬 위치 재계산) |
| 다른 draft 행 | prev.filter(r => r.item_id===null)로 유지 | 개별 교체 가능 |
| 시각 효과 | 행이 정렬 위치로 이동 (TOP_GROUP 위치) | 제자리 업데이트 |
| 데이터 일관성 | DB 최신 상태 반영 | 로컬만 업데이트 |

전체 재로드로 DB 최신 상태를 보장하되, draft 행은 명시적으로 보존.

### 4-3. rowKey 불안정 문제 (visual flicker)

**현상**: 저장 성공 후 `fetchOrders()`가 실제 행(rowKey=`"02041101__<UUID>"`)을 추가하고
draft 행(rowKey=`"__draft_<timestamp>"`)은 사라짐.
AG Grid는 이를 "행 삭제 + 새 행 추가"로 처리 → 순간적 위치 이동.

**영향**: 데이터 손실 없음. 시각적으로 행이 draft 위치(하단)에서 정렬 위치(진행중 TOP_GROUP)로 이동.
오히려 자연스러운 피드백 (저장됐음을 확인 가능).

### 4-4. `getRowStyle` dependency 추가 (`draftErrors`)

`draftErrors`가 바뀔 때마다 `getRowStyle` 함수 재생성 → AG Grid가 모든 행의 스타일 재평가.
행 수가 ~200개 수준이므로 성능 영향 없음. `draftErrors`는 사용자 편집 시에만 변경.

### 4-5. 중복 주문번호 처리

Supabase `orders.order_num` 에 unique constraint 존재.
동일 order_num 입력 시 `insertDraftOrderAction`이 `{ error: "duplicate key..." }` 반환.
→ 해당 draft 행 빨간색 + toast 에러로 표시. 사용자가 order_num 수정 후 다시 Enter.

### 4-6. 플랫폼 prefix 미인식 시

`01/02/03` 외 prefix → `updated.platform`이 초기값 `"avito"` 유지.
`insertDraftOrderAction`에서 `isPlatform("avito")` → 유효하므로 통과.
의도치 않은 플랫폼 저장 가능성 있음.

**해결책**: draft 행에서 order_num 편집 시 prefix 미인식이면 platform을 빈 문자열로 설정하고
저장 전 "플랫폼 확인 필요" 에러를 표시하도록 추가 가능. 추후 개선 항목.

---

## 5. 구현 순서

```
Phase 1 — Server Action (lib/actions/orders.ts)
  [x] insertDraftOrderAction 추가 (redirect 없음)
  [x] InsertDraftOrderResult 타입 export
  [x] typecheck 통과

Phase 2 — orders-ag-grid-table.tsx 핵심 로직
  [x] PREFIX_TO_PLATFORM 상수 추가
  [x] draftErrors 상태 추가
  [x] initialOrders effect: draft 보존
  [x] fetchOrders: draft 보존
  [x] rowData useMemo: draft 격리 (정렬/필터)
  [x] stats useMemo: draft 제외
  [x] orderCount: draft 제외
  [x] getRowStyle: draft 색상 + draftErrors 반영
  [x] addDraftRow 핸들러
  [x] handleDraftCellChange 핸들러
  [x] handleCellValueChanged: draft 분기
  [x] handleFormulaSave: draft 분기
  [x] typecheck 통과

Phase 3 — JSX / 마무리
  [x] + 행 추가 버튼 푸터 추가
  [x] typecheck + build 통과
  [x] 커밋 & 배포

Phase 4 — 버그 수정 (주문번호/상품명 오류 반복 문제)
  [x] Bug 1: INSERT 성공 후 draft 행 중복 INSERT 방지
  [x] Bug 2: 미완성 입력 중 불필요한 빨간색 제거
```

---

## 6. 버그 수정: 주문번호/상품명 오류 반복 문제

> **증상**: 올바른 8자리 주문번호를 입력해도 오류가 반복됨.

---

### Bug 1 — INSERT 성공 후 draft 행이 사라지지 않아 중복 INSERT 발생 (Critical)

**원인 파일**: `components/orders-ag-grid-table.tsx`

**원인 코드** (`fetchOrders`, ~line 591):

```tsx
// 문제: 저장이 끝난 draft 행도 그대로 유지됨
setAllRows((prev) => {
  const drafts = prev.filter((r) => r.item_id === null); // ← 저장된 draft도 포함
  return [...real, ...drafts];
});
```

**흐름**:
1. 사용자가 order_num + product_name 입력 → INSERT 성공
2. `fetchOrders()` 호출 → DB에서 실제 행 로드
3. 위 코드가 `item_id === null` 인 행을 모두 유지 → **저장된 draft 행이 계속 화면에 남아있음**
4. 사용자가 다시 그 행을 편집하거나 포커스 이동 → INSERT 재시도
5. `orders.order_num` unique constraint 위반 → `duplicate key value violates unique constraint` 에러 → 빨간색 표시

**수정 코드** (`handleDraftCellChange` 성공 분기, ~line 697):

```tsx
// 수정 전
setDraftErrors((prev) => { const s = new Set(prev); s.delete(row.rowKey); return s; });
setToastType("success");
setToast("주문을 저장했습니다.");
await fetchOrders();

// 수정 후 — fetchOrders 호출 전에 저장된 draft 행을 먼저 제거
setDraftErrors((prev) => { const s = new Set(prev); s.delete(row.rowKey); return s; });
setAllRows((prev) => prev.filter((r) => r.rowKey !== row.rowKey)); // ← 추가
setToastType("success");
setToast("주문을 저장했습니다.");
await fetchOrders();
```

**핵심**: `fetchOrders`는 `item_id === null` 행을 모두 보존하는 구조이므로,
성공한 draft 행은 `fetchOrders` 호출 전에 직접 `rowKey`로 제거해야 한다.

---

### Bug 2 — 주문번호만 입력해도 즉시 빨간색 표시 (UX)

**원인 파일**: `components/orders-ag-grid-table.tsx`

**원인 코드** (`handleDraftCellChange`, ~line 667):

```tsx
// 문제: order_num만 입력해도 touched=true → 빨간색
if (!ready) {
  const touched = updated.order_num !== "" || updated.product_name !== "";
  if (touched) {
    setDraftErrors((prev) => new Set<string>([...prev, row.rowKey]));
  }
  return;
}
```

**흐름**:
1. 사용자가 order_num 입력 → `touched = true` (product_name은 아직 빈 값)
2. `draftErrors`에 rowKey 추가 → 행이 빨간색으로 변함
3. 사용자는 "뭔가 오류가 났다"고 오해 → product_name을 입력해도 이미 심리적 혼란

**수정 코드**:

```tsx
// 수정 후 — 미완성 상태에선 에러 표시 없이 조용히 대기
if (!ready) {
  return;
}
// 오류 표시는 실제 INSERT 실패 시에만 (아래 if ("error" in result) 블록에서만)
```

**원칙**: 에러 표시는 실제로 저장 시도(INSERT)가 실패했을 때만 한다.
입력 도중의 미완성 상태는 에러가 아니라 단순히 "아직 입력 중"인 상태다.

---

### 수정 결과

| | 수정 전 | 수정 후 |
|---|---|---|
| 올바른 8자리 order_num 입력 | 즉시 빨간색 (product_name 없어서) | 조용히 대기 (에러 없음) |
| product_name까지 입력 완료 | INSERT → 성공 → draft 행 유지 → 재편집 시 duplicate key 에러 | INSERT → 성공 → draft 행 즉시 제거 → 실제 행으로 교체 |
| INSERT 실패 (잘못된 값 등) | 빨간색 + toast | 빨간색 + toast (동일) |
